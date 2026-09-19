import { AsyncLocalStorage } from "node:async_hooks";

export interface SpanContext {
  traceId: string;
  spanId: string;
  traceFlags: number;
}

export interface SpanEvent {
  name: string;
  timeUnixNano: bigint;
  attributes?: Record<string, unknown>;
}

export interface SpanStatus {
  code: "UNSET" | "OK" | "ERROR";
  message?: string;
}

export interface ReadableSpan {
  name: string;
  context: SpanContext;
  parentSpanId?: string;
  startTimeUnixNano: bigint;
  endTimeUnixNano?: bigint;
  durationMs: number;
  attributes: Record<string, unknown>;
  events: SpanEvent[];
  status: SpanStatus;
}

export interface SpanOptions {
  parent?: Span | SpanContext;
  attributes?: Record<string, unknown>;
  startTimeUnixNano?: bigint;
}

function generateHex(bytesCount: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(bytesCount));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function generateTraceId(): string {
  return generateHex(16); // 128-bit hex
}

export function generateSpanId(): string {
  return generateHex(8); // 64-bit hex
}

function nowUnixNano(): bigint {
  return BigInt(Date.now()) * 1_000_000n;
}

export class Span {
  public readonly context: SpanContext;
  public readonly parentSpanId?: string;
  public readonly startTimeUnixNano: bigint;
  public endTimeUnixNano?: bigint;
  public durationMs = 0;
  public readonly attributes: Record<string, unknown>;
  public readonly events: SpanEvent[] = [];
  public status: SpanStatus = { code: "UNSET" };
  private ended = false;

  constructor(
    public readonly name: string,
    context?: SpanContext,
    parentSpanId?: string,
    attributes: Record<string, unknown> = {},
    startTimeUnixNano?: bigint,
  ) {
    this.context = context ?? {
      traceId: generateTraceId(),
      spanId: generateSpanId(),
      traceFlags: 1,
    };
    this.parentSpanId = parentSpanId;
    this.attributes = { ...attributes };
    this.startTimeUnixNano = startTimeUnixNano ?? nowUnixNano();
  }

  setAttribute(key: string, value: unknown): this {
    if (!this.ended) {
      this.attributes[key] = value;
    }
    return this;
  }

  setAttributes(attributes: Record<string, unknown>): this {
    if (!this.ended) {
      Object.assign(this.attributes, attributes);
    }
    return this;
  }

  addEvent(name: string, attributes?: Record<string, unknown>): this {
    if (!this.ended) {
      this.events.push({
        name,
        timeUnixNano: nowUnixNano(),
        attributes,
      });
    }
    return this;
  }

  recordException(error: unknown): this {
    if (this.ended) return this;
    const err = error instanceof Error ? error : new Error(String(error));
    this.status = {
      code: "ERROR",
      message: err.message,
    };
    this.addEvent("exception", {
      "exception.type": err.name,
      "exception.message": err.message,
      "exception.stacktrace": err.stack,
    });
    return this;
  }

  setStatus(status: SpanStatus): this {
    if (!this.ended) {
      this.status = status;
    }
    return this;
  }

  end(endTimeUnixNano?: bigint): void {
    if (this.ended) return;
    this.ended = true;
    this.endTimeUnixNano = endTimeUnixNano ?? nowUnixNano();
    const durationNano = this.endTimeUnixNano - this.startTimeUnixNano;
    this.durationMs = Number(durationNano) / 1_000_000;
  }

  toReadableSpan(): ReadableSpan {
    return {
      name: this.name,
      context: { ...this.context },
      parentSpanId: this.parentSpanId,
      startTimeUnixNano: this.startTimeUnixNano,
      endTimeUnixNano: this.endTimeUnixNano,
      durationMs: this.durationMs,
      attributes: { ...this.attributes },
      events: [...this.events],
      status: { ...this.status },
    };
  }
}

const asyncSpanStorage = new AsyncLocalStorage<Span>();

export class Tracer {
  private finishedSpans: ReadableSpan[] = [];
  public readonly serviceName: string;
  public readonly serviceVersion: string;

  constructor(serviceName = "docket", serviceVersion = "1.5.1") {
    this.serviceName = process.env.OTEL_SERVICE_NAME || serviceName;
    this.serviceVersion = serviceVersion;
  }

  getActiveSpan(): Span | undefined {
    return asyncSpanStorage.getStore();
  }

  getActiveSpanContext(): SpanContext | undefined {
    return this.getActiveSpan()?.context;
  }

  startSpan(name: string, options: SpanOptions = {}): Span {
    const activeSpan = this.getActiveSpan();
    let traceId: string;
    let parentSpanId: string | undefined;

    if (options.parent) {
      const parentCtx = "context" in options.parent ? options.parent.context : options.parent;
      traceId = parentCtx.traceId;
      parentSpanId = parentCtx.spanId;
    } else if (activeSpan) {
      traceId = activeSpan.context.traceId;
      parentSpanId = activeSpan.context.spanId;
    } else {
      traceId = generateTraceId();
    }

    const spanContext: SpanContext = {
      traceId,
      spanId: generateSpanId(),
      traceFlags: 1,
    };

    const span = new Span(
      name,
      spanContext,
      parentSpanId,
      {
        "service.name": this.serviceName,
        "service.version": this.serviceVersion,
        ...options.attributes,
      },
      options.startTimeUnixNano,
    );

    return span;
  }

  async withSpan<T>(name: string, fn: (span: Span) => Promise<T> | T, options: SpanOptions = {}): Promise<T> {
    const span = this.startSpan(name, options);
    return asyncSpanStorage.run(span, async () => {
      try {
        const result = await fn(span);
        if (span.status.code === "UNSET") {
          span.setStatus({ code: "OK" });
        }
        return result;
      } catch (error) {
        span.recordException(error);
        throw error;
      } finally {
        span.end();
        this.finishedSpans.push(span.toReadableSpan());
      }
    });
  }

  getFinishedSpans(): ReadableSpan[] {
    return [...this.finishedSpans];
  }

  clearSpans(): void {
    this.finishedSpans = [];
  }

  exportTraceJson(): string {
    const data = {
      resource: {
        attributes: {
          "service.name": this.serviceName,
          "service.version": this.serviceVersion,
          "process.pid": process.pid,
          "bun.version": Bun.version,
        },
      },
      spans: this.finishedSpans.map((span) => ({
        ...span,
        startTimeUnixNano: span.startTimeUnixNano.toString(),
        endTimeUnixNano: span.endTimeUnixNano?.toString(),
        events: span.events.map((e) => ({
          ...e,
          timeUnixNano: e.timeUnixNano.toString(),
        })),
      })),
    };

    return JSON.stringify(
      data,
      (_key, value) => (typeof value === "bigint" ? value.toString() : value),
      2,
    );
  }

  /**
   * Flushes completed spans to an OpenTelemetry OTLP/HTTP endpoint if configured via
   * standard OTEL_EXPORTER_OTLP_ENDPOINT environment variable.
   */
  async flushOtlp(): Promise<boolean> {
    const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    if (!endpoint || this.finishedSpans.length === 0) {
      return false;
    }

    const url = endpoint.endsWith("/v1/traces") ? endpoint : `${endpoint.replace(/\/+$/, "")}/v1/traces`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (process.env.OTEL_EXPORTER_OTLP_HEADERS) {
      for (const pair of process.env.OTEL_EXPORTER_OTLP_HEADERS.split(",")) {
        const [k, v] = pair.split("=");
        if (k && v) headers[k.trim()] = v.trim();
      }
    }

    const payload = {
      resourceSpans: [
        {
          resource: {
            attributes: [
              { key: "service.name", value: { stringValue: this.serviceName } },
              { key: "service.version", value: { stringValue: this.serviceVersion } },
              { key: "process.pid", value: { intValue: process.pid } },
            ],
          },
          scopeSpans: [
            {
              scope: { name: "docket.core", version: this.serviceVersion },
              spans: this.finishedSpans.map((s) => ({
                traceId: s.context.traceId,
                spanId: s.context.spanId,
                parentSpanId: s.parentSpanId,
                name: s.name,
                kind: 1, // SPAN_KIND_INTERNAL
                startTimeUnixNano: s.startTimeUnixNano.toString(),
                endTimeUnixNano: s.endTimeUnixNano?.toString(),
                attributes: Object.entries(s.attributes).map(([key, value]) => ({
                  key,
                  value: typeof value === "number" ? { doubleValue: value } : typeof value === "boolean" ? { boolValue: value } : { stringValue: String(value) },
                })),
                status: {
                  code: s.status.code === "OK" ? 1 : s.status.code === "ERROR" ? 2 : 0,
                  message: s.status.message,
                },
              })),
            },
          ],
        },
      ],
    };

    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5_000),
      });
      return res.ok;
    } catch {
      return false; // Observability must never crash the primary process
    }
  }
}

export const tracer = new Tracer();
