import type { LogAttrs, LogLevel, Logger } from "../src/shared/logger.js";

export interface LogRecord {
  level: LogLevel;
  event: string;
  attrs: LogAttrs | undefined;
}

/**
 * In-memory logger. Tests read `records` to assert what was logged.
 */
export class FakeLogger implements Logger {
  readonly records: LogRecord[] = [];

  info(event: string, attrs?: LogAttrs): void {
    this.records.push({ level: "info", event, attrs });
  }
  warn(event: string, attrs?: LogAttrs): void {
    this.records.push({ level: "warn", event, attrs });
  }
  error(event: string, attrs?: LogAttrs): void {
    this.records.push({ level: "error", event, attrs });
  }
}
