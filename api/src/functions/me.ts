import {
  app,
  type HttpHandler,
  type HttpRequest,
  type HttpResponseInit,
} from "@azure/functions";
import { requireAuth } from "../shared/auth.js";
import type { SessionSigner } from "../shared/session-signer.js";
import type { TableStorage } from "../shared/table-storage.js";
import type { UserRow } from "../shared/seed.js";

export interface MeDeps {
  tables: TableStorage;
  signer: SessionSigner;
}

type UiLanguage = UserRow["ui_language"];
type UserSettings = UserRow["settings"];
type PreferredMode = UserSettings["preferred_mode"];
type Theme = NonNullable<UserSettings["theme"]>;
type StudyFontSize = NonNullable<UserSettings["study_font_size"]>;

const UI_LANGUAGES = new Set<UiLanguage>(["en", "nl"]);
const PREFERRED_MODES = new Set<PreferredMode>([
  "self_grade",
  "mcq",
  "mixed",
  "ask",
]);
const THEMES = new Set<Theme>(["classic", "playful", "arcade"]);
const STUDY_FONT_SIZES = new Set<StudyFontSize>(["normal", "large", "xlarge"]);

function publicProfile(user: UserRow) {
  return {
    id: user.rowKey,
    name: user.name,
    isAdmin: user.is_admin,
    color: user.color,
    avatar_emoji: user.avatar_emoji,
    ui_language: user.ui_language,
    settings: user.settings,
  };
}

/**
 * Validate an incoming PATCH body against the closed set of
 * user-mutable fields. Returns either a validated, reduced patch
 * object or a 400 response describing what was wrong.
 *
 * The validator ignores any field not in the allowlist — so even if
 * a client sends `is_admin` or `userId`, those fields never reach
 * the merge step. This is the structural enforcement of invariant 1
 * for PATCH.
 */
function validatePatch(
  body: unknown,
):
  | { ok: true; patch: { ui_language?: UiLanguage; settings?: Partial<UserSettings> } }
  | { ok: false; error: string } {
  if (body === null || typeof body !== "object") {
    return { ok: false, error: "body must be an object" };
  }
  const src = body as Record<string, unknown>;
  const patch: { ui_language?: UiLanguage; settings?: Partial<UserSettings> } =
    {};

  if ("ui_language" in src) {
    const v = src.ui_language;
    if (typeof v !== "string" || !UI_LANGUAGES.has(v as UiLanguage)) {
      return { ok: false, error: "invalid ui_language" };
    }
    patch.ui_language = v as UiLanguage;
  }

  if ("settings" in src) {
    const s = src.settings;
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
    if ("theme" in sr) {
      const th = sr.theme;
      if (typeof th !== "string" || !THEMES.has(th as Theme)) {
        return { ok: false, error: "invalid theme" };
      }
      out.theme = th as Theme;
    }
    if ("study_font_size" in sr) {
      const sf = sr.study_font_size;
      if (typeof sf !== "string" || !STUDY_FONT_SIZES.has(sf as StudyFontSize)) {
        return { ok: false, error: "invalid study_font_size" };
      }
      out.study_font_size = sf as StudyFontSize;
    }
    patch.settings = out;
  }

  return { ok: true, patch };
}

export function makeMeHandler(deps: MeDeps): HttpHandler {
  return async (req: HttpRequest): Promise<HttpResponseInit> => {
    const method = (req.method ?? "GET").toUpperCase();
    if (method !== "GET" && method !== "PATCH") {
      return { status: 405, jsonBody: { error: "method not allowed" } };
    }

    const auth = requireAuth(req, deps);
    if (!auth.ok) return auth.response;

    const user = await deps.tables.getById<UserRow>(
      "users",
      "users",
      auth.auth.userId,
    );
    if (!user) return { status: 404, jsonBody: { error: "user not found" } };

    if (method === "GET") {
      return { status: 200, jsonBody: publicProfile(user) };
    }

    const body = await req.json().catch(() => ({}));
    const result = validatePatch(body);
    if (!result.ok) {
      return { status: 400, jsonBody: { error: result.error } };
    }
    const { patch } = result;

    const merged: UserRow = {
      ...user,
      ui_language: patch.ui_language ?? user.ui_language,
      settings: patch.settings
        ? { ...user.settings, ...patch.settings }
        : user.settings,
    };
    await deps.tables.upsert<UserRow>("users", merged);

    return { status: 200, jsonBody: publicProfile(merged) };
  };
}

/* v8 ignore start */
export function registerMe(deps: MeDeps): void {
  app.http("me", {
    route: "me",
    methods: ["GET", "PATCH"],
    authLevel: "anonymous",
    handler: makeMeHandler(deps),
  });
}
/* v8 ignore stop */
