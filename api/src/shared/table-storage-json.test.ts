import { describe, it, expect } from "vitest";
import {
  deserializeJsonFields,
  serializeJsonFields,
} from "./table-storage-json.js";

describe("serializeJsonFields", () => {
  it("stringifies declared JSON fields", () => {
    const out = serializeJsonFields("users", {
      partitionKey: "users",
      rowKey: "u1",
      name: "Alice",
      settings: { auto_speak: true, daily_goal: 20 },
    });
    expect(out.settings).toBe('{"auto_speak":true,"daily_goal":20}');
    expect(out.name).toBe("Alice");
  });

  it("leaves non-declared fields untouched", () => {
    const out = serializeJsonFields("users", {
      partitionKey: "users",
      rowKey: "u1",
      color: "#ff0",
    });
    expect(out.color).toBe("#ff0");
  });

  it("leaves already-stringified declared fields alone", () => {
    const serialized = serializeJsonFields("cards", {
      partitionKey: "c1",
      rowKey: "card-1",
      distractors: '["a","b"]',
    });
    expect(serialized.distractors).toBe('["a","b"]');
  });

  it("skips undefined declared fields", () => {
    const out = serializeJsonFields("users", {
      partitionKey: "users",
      rowKey: "u1",
    });
    expect("settings" in out).toBe(false);
  });
});

describe("deserializeJsonFields", () => {
  it("parses declared JSON fields into JS values", () => {
    const out = deserializeJsonFields<{
      partitionKey: string;
      rowKey: string;
      settings: { auto_speak: boolean };
    }>("users", {
      partitionKey: "users",
      rowKey: "u1",
      settings: '{"auto_speak":true}',
    });
    expect(out.settings).toEqual({ auto_speak: true });
  });

  it("round-trips losslessly through serialize/deserialize", () => {
    const original = {
      partitionKey: "users" as const,
      rowKey: "u1",
      name: "Alice",
      settings: { auto_speak: true, daily_goal: 20, preferred_mode: "mcq" },
    };
    const wire = serializeJsonFields("users", original);
    const back = deserializeJsonFields<typeof original>("users", wire);
    expect(back).toEqual(original);
  });

  it("leaves an unparseable string in place", () => {
    const out = deserializeJsonFields<{
      partitionKey: string;
      rowKey: string;
      settings: unknown;
    }>("users", {
      partitionKey: "users",
      rowKey: "u1",
      settings: "{not json",
    });
    expect(out.settings).toBe("{not json");
  });

  it("does nothing for a table with no declared JSON fields", () => {
    const out = deserializeJsonFields<{
      partitionKey: string;
      rowKey: string;
      label: string;
    }>("years", {
      partitionKey: "years",
      rowKey: "y1",
      label: "2025-2026",
    });
    expect(out.label).toBe("2025-2026");
  });
});
