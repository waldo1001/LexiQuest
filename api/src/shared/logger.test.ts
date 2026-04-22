import { describe, it, expect } from "vitest";
import { SystemLogger } from "./logger.js";
import { FakeLogger } from "../../testing/fake-logger.js";

describe("SystemLogger", () => {
  it("info writes a JSON line with level/event/ts/attrs", () => {
    const lines: string[] = [];
    const logger = new SystemLogger({
      write: (l) => lines.push(l),
      nowMs: () => 1_700_000_000_000,
    });

    logger.info("login_success", { userId: "u1" });

    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]!);
    expect(parsed).toEqual({
      level: "info",
      event: "login_success",
      ts: 1_700_000_000_000,
      userId: "u1",
    });
  });

  it("warn and error use matching levels", () => {
    const lines: string[] = [];
    const logger = new SystemLogger({ write: (l) => lines.push(l) });

    logger.warn("slow_query", { ms: 500 });
    logger.error("db_unreachable");

    expect(JSON.parse(lines[0]!).level).toBe("warn");
    expect(JSON.parse(lines[1]!).level).toBe("error");
    expect(JSON.parse(lines[1]!).event).toBe("db_unreachable");
  });

  it("defaults write to console.log and nowMs to Date.now when unset", () => {
    const original = console.log;
    const captured: string[] = [];
    console.log = (l: unknown) => captured.push(String(l));
    try {
      const logger = new SystemLogger();
      logger.info("defaulted");
      expect(captured).toHaveLength(1);
      const parsed = JSON.parse(captured[0]!);
      expect(parsed.event).toBe("defaulted");
      expect(typeof parsed.ts).toBe("number");
    } finally {
      console.log = original;
    }
  });

  it("omits attrs when none given", () => {
    const lines: string[] = [];
    const logger = new SystemLogger({ write: (l) => lines.push(l) });
    logger.info("bare");
    const parsed = JSON.parse(lines[0]!);
    expect(Object.keys(parsed).sort()).toEqual(["event", "level", "ts"]);
  });
});

describe("FakeLogger", () => {
  it("records the sequence of calls", () => {
    const logger = new FakeLogger();
    logger.info("a", { x: 1 });
    logger.warn("b");
    logger.error("c", { y: "two" });

    expect(logger.records).toEqual([
      { level: "info", event: "a", attrs: { x: 1 } },
      { level: "warn", event: "b", attrs: undefined },
      { level: "error", event: "c", attrs: { y: "two" } },
    ]);
  });
});
