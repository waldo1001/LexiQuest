import { describe, it, expect } from "vitest";
import { translate, strings } from "./strings.js";

describe("translate", () => {
  it("returns the English string for picker.title under lang=en", () => {
    expect(translate("en", "picker.title")).toBe("Who are you?");
  });

  it("returns the Dutch string for picker.title under lang=nl", () => {
    expect(translate("nl", "picker.title")).toBe("Wie ben jij?");
  });

  it("interpolates {name} into home.greeting under lang=en", () => {
    expect(translate("en", "home.greeting", { name: "Lex" })).toBe(
      "Hello, Lex",
    );
  });

  it("interpolates {name} into home.greeting under lang=nl", () => {
    expect(translate("nl", "home.greeting", { name: "Lex" })).toBe(
      "Hallo, Lex",
    );
  });

  it("returns the raw key when the key is unknown in both languages", () => {
    expect(translate("en", "no.such.key")).toBe("no.such.key");
    expect(translate("nl", "no.such.key")).toBe("no.such.key");
  });

  it("falls back to English when the key exists in EN but not NL", () => {
    // Simulate by asking for a key only in EN dict via a direct object lookup;
    // enforced structurally by parity test below. Here we reach into strings
    // to set up the scenario: add a sentinel only to strings.en for the test.
    const sentinelKey = "__test.only_en_sentinel";
    strings.en[sentinelKey] = "only-in-english";
    try {
      expect(translate("nl", sentinelKey)).toBe("only-in-english");
    } finally {
      delete strings.en[sentinelKey];
    }
  });

  it("falls back to the EN dictionary for an unknown lang code", () => {
    expect(translate("xx", "picker.title")).toBe("Who are you?");
  });

  it("leaves a placeholder untouched when params lack the matching key", () => {
    expect(translate("en", "home.greeting", { other: "x" })).toBe(
      "Hello, {name}",
    );
  });

  it("exposes an EN and NL dictionary with identical key sets", () => {
    const enKeys = new Set(Object.keys(strings.en));
    const nlKeys = new Set(Object.keys(strings.nl));
    const onlyEn = [...enKeys].filter((k) => !nlKeys.has(k));
    const onlyNl = [...nlKeys].filter((k) => !enKeys.has(k));
    expect(onlyEn).toEqual([]);
    expect(onlyNl).toEqual([]);
  });
});
