import { describe, it, expect } from "vitest";
import { pickNewest, findStale, formatIssueBody, type ListedModel } from "./model-catalog.js";

// Synthetic catalog — ids shaped like real ones, dates arbitrary.
const CATALOG: ListedModel[] = [
  { id: "claude-sonnet-4-6", created_at: "2026-02-01T00:00:00Z" },
  { id: "claude-sonnet-5", created_at: "2026-05-01T00:00:00Z" },
  { id: "claude-sonnet-5-5", created_at: "2026-09-01T00:00:00Z" },
  { id: "claude-haiku-4-5-20251001", created_at: "2025-10-01T00:00:00Z" },
  { id: "claude-haiku-5-5", created_at: "2026-09-15T00:00:00Z" },
  { id: "claude-opus-5-5", created_at: "2026-10-01T00:00:00Z" },
  { id: "claude-fable-5-1", created_at: "2026-10-05T00:00:00Z" },
  { id: "claude-mythos-5-1", created_at: "2026-10-05T00:00:00Z" },
];

describe("pickNewest (spec #7 AC5)", () => {
  it("pickNewest returns the most recently created claude-sonnet model", () => {
    expect(pickNewest(CATALOG, "sonnet")?.id).toBe("claude-sonnet-5-5");
    expect(pickNewest(CATALOG, "haiku")?.id).toBe("claude-haiku-5-5");
  });

  it("pickNewest ignores opus, fable, mythos and the other family", () => {
    // The newest models overall are opus/fable/mythos — never picked for sonnet or haiku.
    expect(pickNewest(CATALOG, "sonnet")?.id.startsWith("claude-sonnet-")).toBe(true);
    expect(pickNewest(CATALOG, "haiku")?.id.startsWith("claude-haiku-")).toBe(true);
  });

  it("pickNewest returns null when the family is not listed", () => {
    expect(pickNewest(CATALOG.filter((m) => !m.id.startsWith("claude-haiku-")), "haiku")).toBeNull();
    expect(pickNewest([], "sonnet")).toBeNull();
  });

  it("pickNewest breaks a created_at tie by id", () => {
    const tie: ListedModel[] = [
      { id: "claude-sonnet-6", created_at: "2027-01-01T00:00:00Z" },
      { id: "claude-sonnet-6-20270101", created_at: "2027-01-01T00:00:00Z" },
    ];
    expect(pickNewest(tie, "sonnet")?.id).toBe("claude-sonnet-6-20270101");
    expect(pickNewest([...tie].reverse(), "sonnet")?.id).toBe("claude-sonnet-6-20270101");
  });
});

describe("findStale (spec #7 AC5)", () => {
  const current = { sonnet: "claude-sonnet-5-5", haiku: "claude-haiku-5-5" };

  it("findStale reports a family whose newest model is newer than the pin", () => {
    const stale = findStale({ sonnet: "claude-sonnet-4-6", haiku: "claude-haiku-5-5" }, CATALOG);
    expect(stale).toEqual([
      { family: "sonnet", pinned: "claude-sonnet-4-6", newest: "claude-sonnet-5-5", reason: "newer" },
    ]);
  });

  it("findStale reports nothing when both pins are the newest", () => {
    expect(findStale(current, CATALOG)).toEqual([]);
  });

  it("findStale reports a pin the Models API no longer lists as pin-missing", () => {
    const stale = findStale({ sonnet: "claude-sonnet-5-5", haiku: "claude-haiku-3" }, CATALOG);
    expect(stale).toEqual([
      { family: "haiku", pinned: "claude-haiku-3", newest: "claude-haiku-5-5", reason: "pin-missing" },
    ]);
  });

  it("reports pin-missing with newest null when the whole family is gone", () => {
    const noHaiku = CATALOG.filter((m) => !m.id.startsWith("claude-haiku-"));
    expect(findStale(current, noHaiku)).toEqual([
      { family: "haiku", pinned: "claude-haiku-5-5", newest: null, reason: "pin-missing" },
    ]);
  });

  it("treats a dated and an undated id of one release as the same release", () => {
    const both: ListedModel[] = [
      { id: "claude-haiku-4-5", created_at: "2025-10-01T00:00:00Z" },
      { id: "claude-haiku-4-5-20251001", created_at: "2025-10-01T00:00:00Z" },
      { id: "claude-sonnet-5-5", created_at: "2026-09-01T00:00:00Z" },
    ];
    expect(findStale({ sonnet: "claude-sonnet-5-5", haiku: "claude-haiku-4-5" }, both)).toEqual([]);
  });
});

describe("formatIssueBody (spec #7 AC5)", () => {
  it("formatIssueBody names the pinned and the newest id for every stale family", () => {
    const body = formatIssueBody([
      { family: "sonnet", pinned: "claude-sonnet-5-5", newest: "claude-sonnet-6", reason: "newer" },
      { family: "haiku", pinned: "claude-haiku-5-5", newest: null, reason: "pin-missing" },
    ]);
    expect(body).toContain("claude-sonnet-5-5");
    expect(body).toContain("claude-sonnet-6");
    expect(body).toContain("claude-haiku-5-5");
    expect(body).toMatch(/no longer listed/i);
    expect(body).toContain("api/src/shared/claude.ts");
    expect(body).toContain("docs/specs/7-latest-claude-models.md");
  });

  it("returns an empty string when nothing is stale", () => {
    expect(formatIssueBody([])).toBe("");
  });
});
