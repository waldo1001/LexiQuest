export type LogLevel = "info" | "warn" | "error";

type Primitive = string | number | boolean | null;

/**
 * Attribute map for log lines. Keys matching secret names are excluded
 * at the type level so a typo like `logger.info("login", { password })`
 * won't compile.
 */
type BannedKey =
  | "password"
  | "hash"
  | "token"
  | "cookie"
  | "authorization"
  | "apiKey"
  | "connectionString"
  | "imageBase64"
  | "raw"
  | "rawResponse";

export type LogAttrs = {
  [key: string]: Primitive;
} & Partial<Record<BannedKey, never>>;

export interface Logger {
  info(event: string, attrs?: LogAttrs): void;
  warn(event: string, attrs?: LogAttrs): void;
  error(event: string, attrs?: LogAttrs): void;
}

export interface SystemLoggerOptions {
  /** Sink for structured lines; defaults to console.log. */
  write?: (line: string) => void;
  /** Clock for timestamp injection; defaults to `Date.now()`. */
  nowMs?: () => number;
}

export class SystemLogger implements Logger {
  private readonly write: (line: string) => void;
  private readonly nowMs: () => number;

  constructor(options: SystemLoggerOptions = {}) {
    this.write = options.write ?? ((l) => console.log(l));
    this.nowMs = options.nowMs ?? (() => Date.now());
  }

  info(event: string, attrs?: LogAttrs): void {
    this.emit("info", event, attrs);
  }
  warn(event: string, attrs?: LogAttrs): void {
    this.emit("warn", event, attrs);
  }
  error(event: string, attrs?: LogAttrs): void {
    this.emit("error", event, attrs);
  }

  private emit(level: LogLevel, event: string, attrs?: LogAttrs): void {
    const line = { level, event, ts: this.nowMs(), ...(attrs ?? {}) };
    this.write(JSON.stringify(line));
  }
}
