import { describe, it, expect, beforeEach } from "bun:test";
import {
  Tracer,
  Span,
  generateTraceId,
  generateSpanId,
} from "../src/core/telemetry";

describe("Telemetry & OpenTelemetry Tracing (telemetry.ts)", () => {
  let tracer: Tracer;

  beforeEach(() => {
    tracer = new Tracer("docket-test", "1.5.1");
  });

  it("generates valid W3C TraceContext trace IDs and span IDs", () => {
    const traceId = generateTraceId();
    const spanId = generateSpanId();

    expect(traceId).toHaveLength(32);
    expect(/^[0-9a-f]{32}$/.test(traceId)).toBe(true);

    expect(spanId).toHaveLength(16);
    expect(/^[0-9a-f]{16}$/.test(spanId)).toBe(true);
  });

  it("records span attributes, events, and duration correctly", async () => {
    const span = tracer.startSpan("test.operation", {
      attributes: { "custom.key": "initial_value" },
    });

    span.setAttribute("user.id", 42);
    span.setAttributes({ "step.name": "validate", priority: "high" });
    span.addEvent("checkpoint_reached", { bytes: 1024 });

    await new Promise((r) => setTimeout(r, 10));
    span.end();

    const readable = span.toReadableSpan();
    expect(readable.name).toBe("test.operation");
    expect(readable.attributes["custom.key"]).toBe("initial_value");
    expect(readable.attributes["user.id"]).toBe(42);
    expect(readable.attributes["step.name"]).toBe("validate");
    expect(readable.attributes["priority"]).toBe("high");
    expect(readable.events).toHaveLength(1);
    expect(readable.events[0]?.name).toBe("checkpoint_reached");
    expect(readable.events[0]?.attributes?.bytes).toBe(1024);
    expect(readable.durationMs).toBeGreaterThanOrEqual(8);
  });

  it("captures exceptions and marks span status as ERROR", () => {
    const span = tracer.startSpan("failing.operation");
    const testError = new Error("Something went wrong");

    span.recordException(testError);
    span.end();

    const readable = span.toReadableSpan();
    expect(readable.status.code).toBe("ERROR");
    expect(readable.status.message).toBe("Something went wrong");
    expect(readable.events.some((e) => e.name === "exception")).toBe(true);
  });

  it("propagates trace context and establishes parent-child hierarchy via withSpan", async () => {
    await tracer.withSpan("parent.span", async (parentSpan) => {
      parentSpan.setAttribute("scope", "parent");

      expect(tracer.getActiveSpan()).toBe(parentSpan);
      expect(tracer.getActiveSpanContext()?.traceId).toBe(parentSpan.context.traceId);

      await tracer.withSpan("child.span", async (childSpan) => {
        expect(tracer.getActiveSpan()).toBe(childSpan);
        expect(childSpan.context.traceId).toBe(parentSpan.context.traceId);
        expect(childSpan.parentSpanId).toBe(parentSpan.context.spanId);
      });

      // Context restored after child completes
      expect(tracer.getActiveSpan()).toBe(parentSpan);
    });

    const finished = tracer.getFinishedSpans();
    expect(finished).toHaveLength(2);

    const childReadable = finished.find((s) => s.name === "child.span");
    const parentReadable = finished.find((s) => s.name === "parent.span");

    expect(childReadable).toBeDefined();
    expect(parentReadable).toBeDefined();
    expect(childReadable?.context.traceId).toBe(parentReadable?.context.traceId);
    expect(childReadable?.parentSpanId).toBe(parentReadable?.context.spanId);
    expect(parentReadable?.parentSpanId).toBeUndefined();
  });

  it("exports finished spans as structured JSON with resource metadata", async () => {
    await tracer.withSpan("root.job", async () => {
      await tracer.withSpan("sub.step", () => {});
    });

    const jsonString = tracer.exportTraceJson();
    const parsed = JSON.parse(jsonString);

    expect(parsed.resource).toBeDefined();
    expect(parsed.resource.attributes["service.name"]).toBe("docket-test");
    expect(parsed.resource.attributes["service.version"]).toBe("1.5.1");
    expect(parsed.resource.attributes["bun.version"]).toBeDefined();
    expect(parsed.spans).toHaveLength(2);

    tracer.clearSpans();
    expect(tracer.getFinishedSpans()).toHaveLength(0);
  });

  it("handles OTLP flush gracefully without error when endpoint is not configured", async () => {
    const originalEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

    try {
      const result = await tracer.flushOtlp();
      expect(result).toBe(false);
    } finally {
      if (originalEndpoint) {
        process.env.OTEL_EXPORTER_OTLP_ENDPOINT = originalEndpoint;
      }
    }
  });
});
