import { describe, it, expect } from "vitest";
import {
  applyCurrentFlag,
  validateYearCreate,
  validateYearPatch,
  yearProfile,
  type YearRow,
} from "./years-shared.js";
import { FakeTableStorage } from "../../testing/fake-table-storage.js";

function row(id: string, overrides: Partial<YearRow> = {}): YearRow {
  return {
    partitionKey: "years",
    rowKey: id,
    label: `${id}-label`,
    is_current: false,
    start_date: "2026-09-01",
    end_date: "2027-06-30",
    ...overrides,
  };
}

describe("validateYearCreate", () => {
  it("rejects non-object bodies", () => {
    expect(validateYearCreate(null).ok).toBe(false);
    expect(validateYearCreate("nope").ok).toBe(false);
    expect(validateYearCreate(42).ok).toBe(false);
  });

  it("rejects missing or empty label", () => {
    const r = validateYearCreate({
      label: "",
      start_date: "2026-09-01",
      end_date: "2027-06-30",
      is_current: false,
    });
    expect(r.ok).toBe(false);
  });

  it("rejects malformed start_date or end_date", () => {
    const bad1 = validateYearCreate({
      label: "2026-2027",
      start_date: "2026/09/01",
      end_date: "2027-06-30",
      is_current: false,
    });
    expect(bad1.ok).toBe(false);
    const bad2 = validateYearCreate({
      label: "2026-2027",
      start_date: "2026-09-01",
      end_date: "2027-6-30",
      is_current: false,
    });
    expect(bad2.ok).toBe(false);
  });

  it("rejects non-boolean is_current", () => {
    const r = validateYearCreate({
      label: "2026-2027",
      start_date: "2026-09-01",
      end_date: "2027-06-30",
      is_current: "yes",
    });
    expect(r.ok).toBe(false);
  });

  it("returns normalized value on valid body", () => {
    const r = validateYearCreate({
      label: "  2026-2027  ",
      start_date: "2026-09-01",
      end_date: "2027-06-30",
      is_current: true,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toEqual({
        label: "2026-2027",
        start_date: "2026-09-01",
        end_date: "2027-06-30",
        is_current: true,
      });
    }
  });
});

describe("validateYearPatch", () => {
  it("accepts any subset of label / start_date / end_date / is_current", () => {
    const r1 = validateYearPatch({ is_current: true });
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(r1.patch).toEqual({ is_current: true });

    const r2 = validateYearPatch({ label: "2027-2028" });
    expect(r2.ok).toBe(true);

    const r3 = validateYearPatch({});
    expect(r3.ok).toBe(true);
  });

  it("rejects invalid field types same as create", () => {
    expect(validateYearPatch({ label: "" }).ok).toBe(false);
    expect(validateYearPatch({ start_date: "2026/09/01" }).ok).toBe(false);
    expect(validateYearPatch({ end_date: "2027-6-30" }).ok).toBe(false);
    expect(validateYearPatch({ is_current: "nope" }).ok).toBe(false);
    expect(validateYearPatch(null).ok).toBe(false);
  });
});

describe("yearProfile", () => {
  it("returns a serializable shape without partition/row keys", () => {
    const out = yearProfile(row("y1", { label: "2026-2027", is_current: true }));
    expect(out).toEqual({
      id: "y1",
      label: "2026-2027",
      is_current: true,
      start_date: "2026-09-01",
      end_date: "2027-06-30",
    });
  });
});

describe("applyCurrentFlag", () => {
  it("clears is_current on all other years when the subject becomes current", async () => {
    const tables = new FakeTableStorage();
    await tables.upsert<YearRow>("years", row("y1", { is_current: true }));
    await tables.upsert<YearRow>("years", row("y2", { is_current: false }));
    await tables.upsert<YearRow>("years", row("y3", { is_current: false }));

    await applyCurrentFlag(tables, "y3");

    const all = await tables.listByPartition<YearRow>("years", "years");
    const byId = Object.fromEntries(all.map((y) => [y.rowKey, y.is_current]));
    expect(byId).toEqual({ y1: false, y2: false, y3: false });
  });

  it("does not mutate siblings when called as a no-op", async () => {
    const tables = new FakeTableStorage();
    await tables.upsert<YearRow>("years", row("y1", { is_current: true }));
    await tables.upsert<YearRow>("years", row("y2", { is_current: false }));

    // Subject id is a sibling — applyCurrentFlag should only flip siblings
    // (other than the subject) from current → false. Subject itself is
    // handled by the caller's upsert, not by this helper.
    await applyCurrentFlag(tables, "y1");

    const y1 = await tables.getById<YearRow>("years", "years", "y1");
    const y2 = await tables.getById<YearRow>("years", "years", "y2");
    expect(y1?.is_current).toBe(true);
    expect(y2?.is_current).toBe(false);
  });
});
