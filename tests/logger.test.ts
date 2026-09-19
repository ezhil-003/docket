import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Logger } from "../src/core/logger";
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

  it("automatically injects active span traceId, spanId, and stage into logs", async () => {
    logger.setFormat("json");
    logger.setLevel("info");

    await tracer.withSpan("docket.cdp_render", async (span) => {
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

  it("creates child loggers that inherit and merge context", () => {
    logger.setFormat("json");
    const child = logger.child({ component: "browser_pool", workerId: 7 });

    child.info("Worker allocated", { memoryMb: 128 });

    expect(stderrOutput).toHaveLength(1);
    const parsed = JSON.parse(stderrOutput[0]!.trim());

    expect(parsed.data).toEqual({
      component: "browser_pool",
      workerId: 7,
      memoryMb: 128,
    });
  });
});
