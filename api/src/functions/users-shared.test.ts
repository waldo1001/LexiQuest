import { describe, it, expect } from "vitest";
import {
  validateUserCreate,
  validateUserPatch,
  fullProfile,
} from "./users-shared.js";
import type { UserRow } from "../shared/seed.js";

function row(overrides: Partial<UserRow> = {}): UserRow {
  return {
    partitionKey: "users",
    rowKey: "u1",
    name: "Alice",
    password_hash: "fake$s0001$pw",
    is_admin: false,
    color: "#abc",
    avatar_emoji: "🦊",
    ui_language: "nl",
    settings: { auto_speak: true, preferred_mode: "ask", daily_goal: 10 },
    created_at: "2026-04-22T00:00:00.000Z",
    ...overrides,
  };
}

describe("fullProfile", () => {
  it("projects a safe public shape that omits password_hash", () => {
    const p = fullProfile(row());
    expect(p).not.toHaveProperty("password_hash");
    expect(p.id).toBe("u1");
  });
});

const baseCreate = {
  name: "Zoe",
  password: "pw",
  is_admin: false,
  color: "#ff00aa",
  avatar_emoji: "🦄",
  ui_language: "en" as const,
};

describe("validateUserCreate", () => {
  it("rejects null body", () => {
    const r = validateUserCreate(null);
    expect(r.ok).toBe(false);
  });

  it("rejects non-object body", () => {
    const r = validateUserCreate(42);
    expect(r.ok).toBe(false);
  });

  it("rejects missing name", () => {
    const r = validateUserCreate({ ...baseCreate, name: "   " });
    expect(r.ok).toBe(false);
  });

  it("rejects missing password", () => {
    const r = validateUserCreate({ ...baseCreate, password: "" });
    expect(r.ok).toBe(false);
  });

  it("rejects non-boolean is_admin", () => {
    const r = validateUserCreate({ ...baseCreate, is_admin: "yes" });
    expect(r.ok).toBe(false);
  });

  it("rejects empty color", () => {
    const r = validateUserCreate({ ...baseCreate, color: "" });
    expect(r.ok).toBe(false);
  });

  it("rejects empty avatar_emoji", () => {
    const r = validateUserCreate({ ...baseCreate, avatar_emoji: "" });
    expect(r.ok).toBe(false);
  });

  it("rejects invalid ui_language", () => {
    const r = validateUserCreate({ ...baseCreate, ui_language: "fr" });
    expect(r.ok).toBe(false);
  });

  it("accepts omitted settings", () => {
    const r = validateUserCreate(baseCreate);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.settings).toBeUndefined();
  });

  it("rejects settings with non-boolean auto_speak", () => {
    const r = validateUserCreate({
      ...baseCreate,
      settings: { auto_speak: "yes" },
    });
    expect(r.ok).toBe(false);
  });

  it("rejects settings with invalid preferred_mode", () => {
    const r = validateUserCreate({
      ...baseCreate,
      settings: { preferred_mode: "flashcards" },
    });
    expect(r.ok).toBe(false);
  });

  it("rejects settings with non-positive daily_goal", () => {
    const r = validateUserCreate({
      ...baseCreate,
      settings: { daily_goal: 0 },
    });
    expect(r.ok).toBe(false);
  });

  it("rejects settings that is null", () => {
    const r = validateUserCreate({ ...baseCreate, settings: null });
    expect(r.ok).toBe(false);
  });

  it("trims leading/trailing whitespace from name", () => {
    const r = validateUserCreate({ ...baseCreate, name: "  Zoe  " });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.name).toBe("Zoe");
  });
});

describe("validateUserPatch", () => {
  it("rejects null body", () => {
    expect(validateUserPatch(null).ok).toBe(false);
  });

  it("returns empty patch for empty object", () => {
    const r = validateUserPatch({});
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.patch).toEqual({});
  });

  it("rejects non-string name", () => {
    expect(validateUserPatch({ name: 5 }).ok).toBe(false);
  });

  it("rejects non-string color", () => {
    expect(validateUserPatch({ color: 5 }).ok).toBe(false);
  });

  it("rejects non-string avatar_emoji", () => {
    expect(validateUserPatch({ avatar_emoji: 1 }).ok).toBe(false);
  });

  it("rejects non-string password", () => {
    expect(validateUserPatch({ password: 123 }).ok).toBe(false);
  });

  it("rejects settings with invalid auto_speak", () => {
    expect(
      validateUserPatch({ settings: { auto_speak: "x" } }).ok,
    ).toBe(false);
  });

  it("rejects settings with non-integer daily_goal", () => {
    expect(
      validateUserPatch({ settings: { daily_goal: 1.5 } }).ok,
    ).toBe(false);
  });

  it("accepts a settings patch with preferred_mode only", () => {
    const r = validateUserPatch({ settings: { preferred_mode: "mcq" } });
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(r.patch.settings).toEqual({ preferred_mode: "mcq" });
  });

  it("accepts a valid full patch", () => {
    const r = validateUserPatch({
      name: "New",
      password: "new-pw",
      is_admin: true,
      color: "#000",
      avatar_emoji: "🐼",
      ui_language: "en",
      settings: { auto_speak: false, preferred_mode: "ask", daily_goal: 30 },
    });
    expect(r.ok).toBe(true);
  });

  it("AVATAR-6: accepts avatar_image_url /icons/icon-192.png", () => {
    const r = validateUserPatch({ avatar_image_url: "/icons/icon-192.png" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.patch.avatar_image_url).toBe("/icons/icon-192.png");
  });

  it("AVATAR-7: rejects external avatar_image_url (https)", () => {
    expect(
      validateUserPatch({ avatar_image_url: "https://evil.example.com/x.png" })
        .ok,
    ).toBe(false);
  });

  it("AVATAR-8: rejects javascript: avatar_image_url (XSS-shaped)", () => {
    expect(
      validateUserPatch({ avatar_image_url: "javascript:alert(1)" }).ok,
    ).toBe(false);
  });

  it("AVATAR-9: rejects path traversal in avatar_image_url", () => {
    expect(
      validateUserPatch({ avatar_image_url: "/icons/../../etc/passwd" }).ok,
    ).toBe(false);
  });

  it("AVATAR-10: accepts null to clear avatar_image_url", () => {
    const r = validateUserPatch({ avatar_image_url: null });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.patch.avatar_image_url).toBeNull();
  });
});
