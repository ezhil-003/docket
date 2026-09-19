import { tracer } from "./telemetry";

export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";
export type LogFormat = "pretty" | "json";
export type LogSink = (formattedText: string, record: LogRecord) => void;

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

const defaultStderrSink: LogSink = (formattedText: string) => {
  process.stderr.write(formattedText);
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function formatPrettyData(data: Record<string, unknown>): string {
  const entries = Object.entries(data);
  if (entries.length === 0) return "";

  const tokens: string[] = [];
  for (const [key, value] of entries) {
    if (value === undefined || value === null) continue;
    if (key === "bytes" && typeof value === "number") {
      tokens.push(`\x1b[90msize=\x1b[36m${formatBytes(value)}\x1b[0m`);
    } else if (key === "durationMs" && typeof value === "number") {
      tokens.push(`\x1b[90mduration=\x1b[33m${formatDuration(value)}\x1b[0m`);
    } else if ((key === "outputPath" || key === "file" || key === "htmlPath") && typeof value === "string") {
      const basename = value.includes("/") ? value.split("/").pop() : value;
      tokens.push(`\x1b[90mfile=\x1b[32m${basename}\x1b[0m`);
    } else if (typeof value === "boolean") {
      tokens.push(`\x1b[90m${key}=\x1b[35m${value}\x1b[0m`);
    } else if (typeof value === "number") {
      tokens.push(`\x1b[90m${key}=\x1b[33m${value}\x1b[0m`);
    } else if (typeof value === "string") {
      tokens.push(`\x1b[90m${key}=\x1b[37m${value}\x1b[0m`);
    } else {
      tokens.push(`\x1b[90m${key}=\x1b[37m${JSON.stringify(value)}\x1b[0m`);
    }
  }

  return tokens.length > 0 ? ` ${tokens.join(" ")}` : "";
}

export function formatPrettyRecord(record: LogRecord): string {
  const time = record.timestamp.split("T")[1]?.slice(0, 8) ?? record.timestamp;
  const stageStr = record.stage ? `\x1b[35m[${record.stage}]\x1b[0m ` : "";
  const traceStr = record.traceId ? ` \x1b[90m(trace: ${record.traceId.slice(0, 8)})\x1b[0m` : "";

  let levelBadge = record.level.toUpperCase().padEnd(5);
  if (record.level === "error") levelBadge = `\x1b[31m${levelBadge}\x1b[0m`;
  else if (record.level === "warn") levelBadge = `\x1b[33m${levelBadge}\x1b[0m`;
  else if (record.level === "info") levelBadge = `\x1b[36m${levelBadge}\x1b[0m`;
  else if (record.level === "debug") levelBadge = `\x1b[90m${levelBadge}\x1b[0m`;

  const extraStr = record.data ? formatPrettyData(record.data) : "";
  const errStr = record.error ? `\n  \x1b[31m↳ ${record.error.name}: ${record.error.message}\x1b[0m` : "";

  return `\x1b[90m[${time}]\x1b[0m ${levelBadge} ${stageStr}${record.message}${extraStr}${traceStr}${errStr}\n`;
}

export class Logger {
  private currentLevel: LogLevel = "warn";
  private currentFormat: LogFormat = "pretty";
  private defaultContext: Record<string, unknown> = {};
  private sink: LogSink = defaultStderrSink;

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

  setSink(sink: LogSink): void {
    this.sink = sink;
  }

  getSink(): LogSink {
    return this.sink;
  }

  resetSink(): void {
    this.sink = defaultStderrSink;
  }

  child(context: Record<string, unknown>): Logger {
    const childLogger = new Logger();
    childLogger.setLevel(this.currentLevel);
    childLogger.setFormat(this.currentFormat);
    childLogger.setSink(this.sink);
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

    const formatted = this.currentFormat === "json"
      ? JSON.stringify(record) + "\n"
      : formatPrettyRecord(record);

    this.sink(formatted, record);
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
