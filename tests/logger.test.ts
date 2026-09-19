import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Logger, type LogRecord, formatPrettyData } from "../src/core/logger";
import { tracer } from "../src/core/telemetry";

describe("Structured Logger (logger.ts)", () => {
  let logger: Logger;
  let stderrOutput: string[] = [];
  const originalStderrWrite = process.stderr.write;

  beforeEach(() => {
    logger = new Logger();
    stderrOutput = [];
    process.stderr.write = ((chunk: any) => {
      stderrOutput.push(String(chunk));
      return true;
    }) as any;
  });

  afterEach(() => {
    process.stderr.write = originalStderrWrite;
  });

  it("defaults to warn level", () => {
    const defaultLogger = new Logger();
    expect(defaultLogger.getLevel()).toBe("warn");
  });

  it("filters messages based on log level configuration", () => {
    logger.setLevel("warn");

    logger.debug("Debug message should be suppressed");
    logger.info("Info message should be suppressed");
    logger.warn("Warning message should be logged");
    logger.error("Error message should be logged");

    expect(stderrOutput).toHaveLength(2);
    expect(stderrOutput[0]).toContain("Warning message should be logged");
    expect(stderrOutput[1]).toContain("Error message should be logged");
  });

  it("suppresses all output when level is silent", () => {
    logger.setLevel("silent");

    logger.debug("Suppress debug");
    logger.info("Suppress info");
    logger.warn("Suppress warn");
    logger.error("Suppress error");

    expect(stderrOutput).toHaveLength(0);
  });

  const stripAnsi = (str: string) => str.replace(/\x1b\[[0-9;]*m/g, "");

  it("formats pretty data as readable tokens without raw JSON stringification", () => {
    const rawTokens = formatPrettyData({
      bytes: 350024,
      durationMs: 640,
      outputPath: "/Users/test/Documents/report.pdf",
      cached: true,
      retries: 2,
    });
    const stripped = stripAnsi(rawTokens);

    // Verify key formatted tokens are present
    expect(stripped).toContain("size=341.8 KB");
    expect(stripped).toContain("duration=640ms");
    expect(stripped).toContain("file=report.pdf");
    expect(stripped).toContain("cached=true");
    expect(stripped).toContain("retries=2");

    // Must NOT contain raw JSON syntax
    expect(rawTokens).not.toContain('{"');
    expect(rawTokens).not.toContain("}");
  });

  it("formats pretty logs cleanly in terminal mode", () => {
    logger.setLevel("info");
    logger.info("Render complete", { bytes: 1048576, durationMs: 1250, file: "doc.pdf" });

    expect(stderrOutput).toHaveLength(1);
    const stripped = stripAnsi(stderrOutput[0]!);
    expect(stripped).toContain("INFO");
    expect(stripped).toContain("Render complete");
    expect(stripped).toContain("size=1.00 MB");
    expect(stripped).toContain("duration=1.25s");
    expect(stripped).toContain("file=doc.pdf");
    expect(stderrOutput[0]).not.toContain('{"bytes":');
  });

  it("formats output as valid JSON lines (NDJSON) in json mode", () => {
    logger.setFormat("json");
    logger.setLevel("debug");

    logger.info("Operation started", { docTitle: "Annual Report", pageCount: 4 });

    expect(stderrOutput).toHaveLength(1);
    const parsed = JSON.parse(stderrOutput[0]!.trim());

    expect(parsed.level).toBe("info");
    expect(parsed.message).toBe("Operation started");
    expect(parsed.data).toEqual({ docTitle: "Annual Report", pageCount: 4 });
    expect(parsed.timestamp).toBeDefined();
    expect(parsed.pid).toBe(process.pid);
  });

  it("supports pluggable sinks to divert logs away from stderr", () => {
    const sinkRecords: LogRecord[] = [];
    const sinkFormatted: string[] = [];

    logger.setSink((formatted, record) => {
      sinkFormatted.push(formatted);
      sinkRecords.push(record);
    });

    logger.setLevel("info");
    logger.info("Intercepted message", { worker: "cdp-1" });

    // Custom sink received the log
    expect(sinkRecords).toHaveLength(1);
    expect(sinkRecords[0]?.message).toBe("Intercepted message");
    expect(sinkRecords[0]?.data?.worker).toBe("cdp-1");
    expect(sinkFormatted).toHaveLength(1);

    // stderr was NOT touched
    expect(stderrOutput).toHaveLength(0);

    // resetSink restores stderr writing
    logger.resetSink();
    logger.warn("Restored message");
    expect(stderrOutput).toHaveLength(1);
    expect(stderrOutput[0]).toContain("Restored message");
  });

  it("automatically injects active span traceId, spanId, and stage into logs", async () => {
    logger.setFormat("json");
    logger.setLevel("info");

    await tracer.withSpan("docket.cdp_render", async () => {
      logger.info("Page loaded inside CDP span");
    });

    expect(stderrOutput).toHaveLength(1);
    const parsed = JSON.parse(stderrOutput[0]!.trim());

    expect(parsed.traceId).toBeDefined();
    expect(parsed.traceId).toHaveLength(32);
    expect(parsed.spanId).toBeDefined();
    expect(parsed.spanId).toHaveLength(16);
    expect(parsed.stage).toBe("cdp_render");
  });

  it("serializes errors cleanly in JSON mode", () => {
    logger.setFormat("json");
    const testErr = new Error("Failed to render PDF page");
    (testErr as any).code = "ERR_CDP_TIMEOUT";

    logger.error("Render crash", testErr, { retries: 3 });

    expect(stderrOutput).toHaveLength(1);
    const parsed = JSON.parse(stderrOutput[0]!.trim());

    expect(parsed.level).toBe("error");
    expect(parsed.message).toBe("Render crash");
    expect(parsed.error).toBeDefined();
    expect(parsed.error.name).toBe("Error");
    expect(parsed.error.message).toBe("Failed to render PDF page");
    expect(parsed.error.code).toBe("ERR_CDP_TIMEOUT");
    expect(parsed.data).toEqual({ retries: 3 });
  });

  it("creates child loggers that inherit context and active sink", () => {
    const sinkRecords: LogRecord[] = [];
    logger.setSink((_, record) => sinkRecords.push(record));
    logger.setLevel("info");

    const child = logger.child({ component: "browser_pool", workerId: 7 });
    child.info("Worker allocated", { memoryMb: 128 });

    expect(sinkRecords).toHaveLength(1);
    expect(sinkRecords[0]?.data).toEqual({
      component: "browser_pool",
      workerId: 7,
      memoryMb: 128,
    });
  });
});
