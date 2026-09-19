import { ensureChromiumBinary } from "./browser-cache";
import { DocketError } from "./errors";

export interface CdpPrintOptions {
  printBackground?: boolean;
  preferCSSPageSize?: boolean;
  paperWidth?: number;
  paperHeight?: number;
  marginTop?: number;
  marginBottom?: number;
  marginLeft?: number;
  marginRight?: number;
}

export interface CdpBrowserOptions {
  executablePath?: string;
  timeoutMs?: number;
}

export class CdpPage {
  private ws: WebSocket | null = null;
  private messageId = 1;
  private pendingCallbacks = new Map<number, { resolve: (val: any) => void; reject: (err: Error) => void; timer?: Timer }>();
  private isClosed = false;

  constructor(
    public readonly targetId: string,
    public readonly wsUrl: string,
    private readonly port: number,
  ) {}

  async connect(timeoutMs = 15_000): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new DocketError(`CDP WebSocket connection timed out after ${timeoutMs}ms`, "ERR_CDP_TIMEOUT", "Check if Chromium is responsive.", true, { stage: "render" }));
      }, timeoutMs);

      try {
        const ws = new WebSocket(this.wsUrl);
        this.ws = ws;

        ws.onopen = () => {
          clearTimeout(timer);
          resolve();
        };

        ws.onerror = (event) => {
          clearTimeout(timer);
          reject(new DocketError(`CDP WebSocket error: ${String(event)}`, "ERR_CDP_SOCKET", "Chromium DevTools protocol encountered an error.", true, { stage: "render" }));
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.id && this.pendingCallbacks.has(data.id)) {
              const cb = this.pendingCallbacks.get(data.id)!;
              this.pendingCallbacks.delete(data.id);
              if (cb.timer) clearTimeout(cb.timer);
              if (data.error) {
                cb.reject(new Error(data.error.message || JSON.stringify(data.error)));
              } else {
                cb.resolve(data.result);
              }
            }
          } catch {
            // Ignore malformed CDP events
          }
        };

        ws.onclose = () => {
          this.isClosed = true;
          for (const [id, cb] of this.pendingCallbacks.entries()) {
            if (cb.timer) clearTimeout(cb.timer);
            cb.reject(new Error("CDP socket closed unexpectedly"));
            this.pendingCallbacks.delete(id);
          }
        };
      } catch (err) {
        clearTimeout(timer);
        reject(err);
      }
    });
  }

  send(method: string, params: Record<string, unknown> = {}, timeoutMs = 30_000): Promise<any> {
    if (this.isClosed || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error(`Cannot send CDP command '${method}': Page is closed`));
    }

    const id = this.messageId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingCallbacks.delete(id);
        reject(new DocketError(`CDP command '${method}' timed out after ${timeoutMs}ms`, "ERR_CDP_CMD_TIMEOUT", "Check document size or syntax errors.", true, { stage: "render" }));
      }, timeoutMs);

      this.pendingCallbacks.set(id, { resolve, reject, timer });
      this.ws!.send(JSON.stringify({ id, method, params }));
    });
  }

  async setDocumentContent(html: string): Promise<void> {
    await this.send("Page.enable");
    const frameTree = await this.send("Page.getFrameTree");
    const frameId = frameTree.frameTree.frame.id;
    await this.send("Page.setDocumentContent", { frameId, html });
  }

  async evaluate(expression: string, awaitPromise = false): Promise<any> {
    const res = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise,
      returnByValue: true,
    });
    return res?.result?.value;
  }

  async waitForFonts(timeoutMs = 10_000): Promise<void> {
    try {
      await this.evaluate(
        `Promise.race([
          document.fonts ? document.fonts.ready.then(() => true) : Promise.resolve(true),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Font loading timed out")), ${timeoutMs}))
        ])`,
        true
      );
    } catch {
      // Best effort font loading guarantee
    }
  }

  async printToPdf(options: CdpPrintOptions = {}): Promise<Buffer> {
    const params: Record<string, unknown> = {
      printBackground: options.printBackground ?? true,
      preferCSSPageSize: options.preferCSSPageSize ?? true,
      paperWidth: options.paperWidth ?? 8.27,
      paperHeight: options.paperHeight ?? 11.69,
      marginTop: options.marginTop ?? 0,
      marginBottom: options.marginBottom ?? 0,
      marginLeft: options.marginLeft ?? 0,
      marginRight: options.marginRight ?? 0,
    };

    const result = await this.send("Page.printToPDF", params, 60_000);
    if (!result || typeof result.data !== "string") {
      throw new DocketError("CDP Page.printToPDF did not return PDF base64 data", "ERR_CDP_PDF_FAILED", "Verify document layout and page size.", true, { stage: "render" });
    }

    return Buffer.from(result.data, "base64");
  }

  async close(): Promise<void> {
    if (this.isClosed) return;
    this.isClosed = true;

    try {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.close();
      }
    } catch {
      // Ignore socket close error
    }

    try {
      await fetch(`http://127.0.0.1:${this.port}/json/close/${this.targetId}`, { method: "PUT" });
    } catch {
      // Ignore tab close failure on teardown
    }
  }
}

export class CdpBrowser {
  private isClosed = false;

  constructor(
    private readonly proc: ReturnType<typeof Bun.spawn>,
    public readonly port: number,
    public readonly browserWsUrl: string,
  ) {}

  get connected(): boolean {
    return !this.isClosed && this.proc.exitCode === null;
  }

  async newPage(): Promise<CdpPage> {
    if (!this.connected) {
      throw new Error("Chromium browser is not connected");
    }

    const response = await fetch(`http://127.0.0.1:${this.port}/json/new?about:blank`, { method: "PUT" });
    if (!response.ok) {
      throw new Error(`Failed to create page: HTTP ${response.status} ${response.statusText}`);
    }

    const tab = await response.json();
    const page = new CdpPage(tab.id, tab.webSocketDebuggerUrl, this.port);
    await page.connect();
    return page;
  }

  async close(): Promise<void> {
    if (this.isClosed) return;
    this.isClosed = true;

    try {
      this.proc.kill();
    } catch {
      // Best-effort process kill
    }
  }
}

/**
 * Launches a headless Chromium browser using Bun.spawn and captures the DevTools WebSocket port.
 */
export async function launchCdpBrowser(options: CdpBrowserOptions = {}): Promise<CdpBrowser> {
  const binaryPath = options.executablePath || (await ensureChromiumBinary());
  const timeoutMs = options.timeoutMs ?? 15_000;

  const args = [
    binaryPath,
    "--headless=new",
    "--remote-debugging-port=0",
    "--hide-scrollbars",
    "--mute-audio",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--no-first-run",
  ];

  const proc = Bun.spawn(args, {
    stderr: "pipe",
    stdout: "ignore",
  });

  const reader = proc.stderr.getReader();
  const decoder = new TextDecoder();
  let wsUrl = "";
  let port = 0;
  let buffer = "";

  const timer = setTimeout(() => {
    try { proc.kill(); } catch {}
  }, timeoutMs);

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const match = buffer.match(/DevTools listening on (ws:\/\/127\.0\.0\.1:(\d+)\/[^\s]+)/);
      if (match && match[1] && match[2]) {
        wsUrl = match[1];
        port = parseInt(match[2], 10);
        break;
      }
    }
  } finally {
    clearTimeout(timer);
    try { reader.releaseLock(); } catch {}
  }

  if (!wsUrl || !port) {
    try { proc.kill(); } catch {}
    throw new DocketError(
      "Failed to read DevTools WebSocket URL from headless Chromium startup.",
      "ERR_CDP_LAUNCH_FAILED",
      "Ensure Chromium has required dependencies installed and port binding is allowed.",
      true,
      { stage: "render" }
    );
  }

  return new CdpBrowser(proc, port, wsUrl);
}
