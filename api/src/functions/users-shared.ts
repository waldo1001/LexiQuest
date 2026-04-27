import type { UserRow } from "../shared/seed.js";

type UiLanguage = UserRow["ui_language"];
type UserSettings = UserRow["settings"];
type PreferredMode = UserSettings["preferred_mode"];

export const UI_LANGUAGES = new Set<UiLanguage>(["en", "nl"]);
export const PREFERRED_MODES = new Set<PreferredMode>([
  "self_grade",
  "mcq",
  "mixed",
  "ask",
]);

export const AVATAR_IMAGE_URL_RE = /^\/icons\/[a-z0-9-]+\.(png|webp)$/;

export function fullProfile(user: UserRow) {
  return {
    id: user.rowKey,
    name: user.name,
    isAdmin: user.is_admin,
    color: user.color,
    avatar_emoji: user.avatar_emoji,
    avatar_image_url: user.avatar_image_url ?? null,
    ui_language: user.ui_language,
    settings: user.settings,
    created_at: user.created_at,
  };
}

export interface UserCreateBody {
  name: string;
  password: string;
  is_admin: boolean;
  color: string;
  avatar_emoji: string;
  ui_language: UiLanguage;
  settings?: Partial<UserSettings>;
}

export function validateUserCreate(
  body: unknown,
):
  | { ok: true; value: UserCreateBody }
  | { ok: false; error: string } {
  if (body === null || typeof body !== "object") {
    return { ok: false, error: "body must be an object" };
  }
  const src = body as Record<string, unknown>;
  if (typeof src.name !== "string" || src.name.trim().length === 0) {
    return { ok: false, error: "name is required" };
  }
  if (typeof src.password !== "string" || src.password.length === 0) {
    return { ok: false, error: "password is required" };
  }
  if (typeof src.is_admin !== "boolean") {
    return { ok: false, error: "is_admin must be boolean" };
  }
  if (typeof src.color !== "string" || src.color.length === 0) {
    return { ok: false, error: "color is required" };
  }
  if (typeof src.avatar_emoji !== "string" || src.avatar_emoji.length === 0) {
    return { ok: false, error: "avatar_emoji is required" };
  }
  if (
    typeof src.ui_language !== "string" ||
    !UI_LANGUAGES.has(src.ui_language as UiLanguage)
  ) {
    return { ok: false, error: "invalid ui_language" };
  }

  let settings: Partial<UserSettings> | undefined;
  if ("settings" in src && src.settings !== undefined) {
    const parsed = validateSettings(src.settings);
    if (!parsed.ok) return parsed;
    settings = parsed.value;
  }

  return {
    ok: true,
    value: {
      name: src.name.trim(),
      password: src.password,
      is_admin: src.is_admin,
      color: src.color,
      avatar_emoji: src.avatar_emoji,
      ui_language: src.ui_language as UiLanguage,
      ...(settings !== undefined && { settings }),
    },
  };
}

export interface UserPatchBody {
  name?: string;
  password?: string;
  is_admin?: boolean;
  color?: string;
  avatar_emoji?: string;
  avatar_image_url?: string | null;
  ui_language?: UiLanguage;
  settings?: Partial<UserSettings>;
}

export function validateUserPatch(
  body: unknown,
):
  | { ok: true; patch: UserPatchBody }
  | { ok: false; error: string } {
  if (body === null || typeof body !== "object") {
    return { ok: false, error: "body must be an object" };
  }
  const src = body as Record<string, unknown>;
  const patch: UserPatchBody = {};

  if ("name" in src) {
    if (typeof src.name !== "string" || src.name.trim().length === 0) {
      return { ok: false, error: "name must be a non-empty string" };
    }
    patch.name = src.name.trim();
  }
  if ("password" in src) {
    if (typeof src.password !== "string" || src.password.length === 0) {
      return { ok: false, error: "password must be a non-empty string" };
    }
    patch.password = src.password;
  }
  if ("is_admin" in src) {
    if (typeof src.is_admin !== "boolean") {
      return { ok: false, error: "is_admin must be boolean" };
    }
    patch.is_admin = src.is_admin;
  }
  if ("color" in src) {
    if (typeof src.color !== "string" || src.color.length === 0) {
      return { ok: false, error: "color must be a non-empty string" };
    }
    patch.color = src.color;
  }
  if ("avatar_emoji" in src) {
    if (typeof src.avatar_emoji !== "string" || src.avatar_emoji.length === 0) {
      return { ok: false, error: "avatar_emoji must be a non-empty string" };
    }
    patch.avatar_emoji = src.avatar_emoji;
  }
  if ("avatar_image_url" in src) {
    const v = src.avatar_image_url;
    if (v === null || v === "") {
      patch.avatar_image_url = null;
    } else if (typeof v !== "string" || !AVATAR_IMAGE_URL_RE.test(v)) {
      return {
        ok: false,
        error:
          "avatar_image_url must match /icons/<name>.(png|webp) or be null",
      };
    } else {
      patch.avatar_image_url = v;
    }
  }
  if ("ui_language" in src) {
    if (
      typeof src.ui_language !== "string" ||
      !UI_LANGUAGES.has(src.ui_language as UiLanguage)
    ) {
      return { ok: false, error: "invalid ui_language" };
    }
    patch.ui_language = src.ui_language as UiLanguage;
  }
  if ("settings" in src && src.settings !== undefined) {
    const parsed = validateSettings(src.settings);
    if (!parsed.ok) return parsed;
    patch.settings = parsed.value;
  }

  return { ok: true, patch };
}

function validateSettings(
  s: unknown,
):
  | { ok: true; value: Partial<UserSettings> }
  | { ok: false; error: string } {
  if (s === null || typeof s !== "object") {
    return { ok: false, error: "settings must be an object" };
  }
  const out: Partial<UserSettings> = {};
  const sr = s as Record<string, unknown>;
  if ("auto_speak" in sr) {
    if (typeof sr.auto_speak !== "boolean") {
      return { ok: false, error: "settings.auto_speak must be boolean" };
    }
    out.auto_speak = sr.auto_speak;
  }
  if ("preferred_mode" in sr) {
    const m = sr.preferred_mode;
    if (typeof m !== "string" || !PREFERRED_MODES.has(m as PreferredMode)) {
      return { ok: false, error: "invalid preferred_mode" };
    }
    out.preferred_mode = m as PreferredMode;
  }
  if ("daily_goal" in sr) {
    const g = sr.daily_goal;
    if (typeof g !== "number" || !Number.isInteger(g) || g < 1) {
      return { ok: false, error: "daily_goal must be a positive integer" };
    }
    out.daily_goal = g;
  }
  return { ok: true, value: out };
}
