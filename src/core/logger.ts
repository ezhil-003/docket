import { tracer } from "./telemetry";

export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";
export type LogFormat = "pretty" | "json";

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

export interface LogRecord {
  timestamp: string;
  level: LogLevel;
  message: string;
  stage?: string;
  traceId?: string;
  spanId?: string;
  pid: number;
  data?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
  };
}

export class Logger {
  private currentLevel: LogLevel = "info";
  private currentFormat: LogFormat = "pretty";
  private defaultContext: Record<string, unknown> = {};

  constructor() {
    const envLevel = process.env.DOCKET_LOG_LEVEL?.toLowerCase() as LogLevel | undefined;
    if (envLevel && envLevel in LEVEL_WEIGHT) {
      this.currentLevel = envLevel;
    }

    const envFormat = process.env.DOCKET_LOG_FORMAT?.toLowerCase() as LogFormat | undefined;
    if (envFormat === "json" || envFormat === "pretty") {
      this.currentFormat = envFormat;
    }
  }

  setLevel(level: LogLevel): void {
    this.currentLevel = level;
  }

  getLevel(): LogLevel {
    return this.currentLevel;
  }

  setFormat(format: LogFormat): void {
    this.currentFormat = format;
  }

  getFormat(): LogFormat {
    return this.currentFormat;
  }

  child(context: Record<string, unknown>): Logger {
    const childLogger = new Logger();
    childLogger.setLevel(this.currentLevel);
    childLogger.setFormat(this.currentFormat);
    childLogger.defaultContext = { ...this.defaultContext, ...context };
    return childLogger;
  }

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_WEIGHT[level] >= LEVEL_WEIGHT[this.currentLevel];
  }

  private emit(level: LogLevel, message: string, extra?: Record<string, unknown>, err?: unknown): void {
    if (!this.shouldLog(level)) return;

    const activeSpan = tracer.getActiveSpan();
    const traceCtx = activeSpan?.context;

    const mergedData = { ...this.defaultContext, ...extra };
    const stage = (mergedData.stage as string) || (activeSpan?.name ? activeSpan.name.replace(/^docket\./, "") : undefined);
    delete mergedData.stage;

    let errorObj: LogRecord["error"];
    if (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      errorObj = {
        name: e.name,
        message: e.message,
        stack: e.stack,
        code: (e as any).code,
      };
    }

    const record: LogRecord = {
      timestamp: new Date().toISOString(),
      level,
      message,
      stage,
      traceId: traceCtx?.traceId,
      spanId: traceCtx?.spanId,
      pid: process.pid,
      data: Object.keys(mergedData).length > 0 ? mergedData : undefined,
      error: errorObj,
    };

    if (this.currentFormat === "json") {
      process.stderr.write(JSON.stringify(record) + "\n");
    } else {
      this.emitPretty(record);
    }
  }

  private emitPretty(record: LogRecord): void {
    const time = record.timestamp.split("T")[1]?.slice(0, 8) ?? record.timestamp;
    const stageStr = record.stage ? `[${record.stage}] ` : "";
    const traceStr = record.traceId ? ` (trace: ${record.traceId.slice(0, 8)})` : "";

    let levelBadge = record.level.toUpperCase();
    if (record.level === "error") levelBadge = `\x1b[31m${levelBadge}\x1b[0m`;
    else if (record.level === "warn") levelBadge = `\x1b[33m${levelBadge}\x1b[0m`;
    else if (record.level === "info") levelBadge = `\x1b[36m${levelBadge}\x1b[0m`;
    else if (record.level === "debug") levelBadge = `\x1b[90m${levelBadge}\x1b[0m`;

    const extraStr = record.data ? ` ${JSON.stringify(record.data)}` : "";
    const errStr = record.error ? `\n  ↳ ${record.error.name}: ${record.error.message}` : "";

    process.stderr.write(`[${time}] ${levelBadge} ${stageStr}${record.message}${extraStr}${traceStr}${errStr}\n`);
  }

  debug(message: string, extra?: Record<string, unknown>): void {
    this.emit("debug", message, extra);
  }

  info(message: string, extra?: Record<string, unknown>): void {
    this.emit("info", message, extra);
  }

  warn(message: string, extra?: Record<string, unknown>): void {
    this.emit("warn", message, extra);
  }

  error(message: string, error?: unknown, extra?: Record<string, unknown>): void {
    this.emit("error", message, extra, error);
  }
}

export const logger = new Logger();
