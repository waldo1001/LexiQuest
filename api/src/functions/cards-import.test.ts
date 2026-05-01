import { describe, it, expect, beforeEach } from "vitest";
import type { HttpRequest, InvocationContext } from "@azure/functions";
import JSZip from "jszip";
import { makeCardsImportHandler, type CardsImportDeps } from "./cards-import.js";
import { FakeTableStorage } from "../../testing/fake-table-storage.js";
import { FakeSessionSigner } from "../../testing/fake-session-signer.js";
import { FakeClock } from "../../testing/fake-clock.js";
import { FakeClaudeClient } from "../../testing/fake-claude-client.js";
import { FakeLogger } from "../../testing/fake-logger.js";
import { buildSessionCookie } from "../shared/session-cookie.js";
import { PARTITIONS } from "../shared/table-partitions.js";
import type { UserRow } from "../shared/seed.js";
import type { CourseRow } from "./courses-shared.js";
import type { CardCandidate } from "../shared/claude.js";

const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

async function buildPptxBase64(
  entries: Array<{ index: number; slideRuns?: string[]; notesRuns?: string[] }>,
): Promise<string> {
  const zip = new JSZip();
  for (const entry of entries) {
    const runs = entry.slideRuns ?? [];
    const slideXml = `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree>${runs
      .map((r) => `<a:p><a:r><a:t>${r}</a:t></a:r></a:p>`)
      .join("")}</p:spTree></p:cSld></p:sld>`;
    zip.file(`ppt/slides/slide${entry.index}.xml`, slideXml);
    if (entry.notesRuns) {
      const notesXml = `<?xml version="1.0"?><p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree>${entry.notesRuns
        .map((r) => `<a:p><a:r><a:t>${r}</a:t></a:r></a:p>`)
        .join("")}</p:spTree></p:cSld></p:notes>`;
      zip.file(`ppt/notesSlides/notesSlide${entry.index}.xml`, notesXml);
    }
  }
  const buf = await zip.generateAsync({ type: "nodebuffer" });
  return buf.toString("base64");
}

const ctx = {} as InvocationContext;
const NOW = "2026-04-23T10:00:00.000Z";
const USER_ID = "u-lex";
const COURSE_ID = "course-fr";

const CANDIDATES: CardCandidate[] = [
  { question: "le chien", answer: "the dog", distractors: ["the cat", "the bird"] },
  { question: "la maison", answer: "the house", distractors: ["the car", "the tree"] },
];

function makeReq(
  cookie: string | null,
  body: unknown,
  method = "POST",
): HttpRequest {
  return {
    method,
    url: "http://local/api/cards/import",
    params: {},
    headers: { get: (n: string) => (n.toLowerCase() === "cookie" ? cookie : null) },
    query: { get: () => null },
    json: async () => (body === undefined ? Promise.reject(new Error("no body")) : body),
  } as unknown as HttpRequest;
}

function makeDeps(): CardsImportDeps & {
  tables: FakeTableStorage;
  signer: FakeSessionSigner;
  clock: FakeClock;
  claude: FakeClaudeClient;
  logger: FakeLogger;
} {
  const clock = new FakeClock(NOW);
  const signer = new FakeSessionSigner(clock);
  const tables = new FakeTableStorage();
  const claude = new FakeClaudeClient();
  const logger = new FakeLogger();
  return { tables, signer, clock, claude, logger };
}

function validCookie(deps: ReturnType<typeof makeDeps>, userId = USER_ID): string {
  const token = deps.signer.sign({ userId, isAdmin: false, expMs: deps.clock.nowMs() + 60_000 });
  return buildSessionCookie(token);
}

function adminCookie(deps: ReturnType<typeof makeDeps>): string {
  const token = deps.signer.sign({ userId: "u-admin", isAdmin: true, expMs: deps.clock.nowMs() + 60_000 });
  return buildSessionCookie(token);
}

async function seedCourse(
  deps: ReturnType<typeof makeDeps>,
  overrides: Partial<CourseRow> = {},
): Promise<CourseRow> {
  const row: CourseRow = {
    partitionKey: USER_ID,
    rowKey: COURSE_ID,
    user_id: USER_ID,
    year_id: "year-2026",
    name: "French 🇫🇷",
    emoji: "🇫🇷",
    color: "#0057a8",
    language: "fr-FR",
    default_mode: "self_grade",
    created_at: NOW,
    ...overrides,
  };
  await deps.tables.upsert<CourseRow>("courses", row);
  return row;
}

async function seedUser(deps: ReturnType<typeof makeDeps>, userId = USER_ID): Promise<void> {
  const row: UserRow = {
    partitionKey: PARTITIONS.users,
    rowKey: userId,
    id: userId,
    name: "Lex",
    password_hash: "x",
    is_admin: false,
    color: "#111",
    avatar_emoji: "🦊",
    ui_language: "en",
    settings: JSON.stringify({ auto_speak: false }),
    created_at: NOW,
  };
  await deps.tables.upsert<UserRow>("users", row);
}

const validBody = {
  courseId: COURSE_ID,
  imageBase64: "base64data",
  mimeType: "image/jpeg",
};

describe("POST /api/cards/import", () => {
  let deps: ReturnType<typeof makeDeps>;

  beforeEach(() => {
    deps = makeDeps();
  });

  it("AC1: returns 401 when no cookie", async () => {
    const res = await makeCardsImportHandler(deps)(makeReq(null, validBody), ctx);
    expect(res.status).toBe(401);
  });

  it("AC2: returns 405 for non-POST method", async () => {
    const res = await makeCardsImportHandler(deps)(makeReq(validCookie(deps), validBody, "GET"), ctx);
    expect(res.status).toBe(405);
  });

  it("AC3: returns 400 when body is missing", async () => {
    const res = await makeCardsImportHandler(deps)(
      makeReq(validCookie(deps), undefined),
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it("AC4: returns 400 when courseId is missing", async () => {
    const res = await makeCardsImportHandler(deps)(
      makeReq(validCookie(deps), { imageBase64: "x", mimeType: "image/jpeg" }),
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it("AC5: returns 400 when imageBase64 is missing", async () => {
    const res = await makeCardsImportHandler(deps)(
      makeReq(validCookie(deps), { courseId: COURSE_ID, mimeType: "image/jpeg" }),
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it("AC6: returns 400 when mimeType is invalid", async () => {
    const res = await makeCardsImportHandler(deps)(
      makeReq(validCookie(deps), { courseId: COURSE_ID, imageBase64: "x", mimeType: "text/plain" }),
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it("AC7: returns 404 when course not found", async () => {
    const res = await makeCardsImportHandler(deps)(makeReq(validCookie(deps), validBody), ctx);
    expect(res.status).toBe(404);
  });

  it("AC8: returns 403 when caller is not owner and not admin", async () => {
    await seedCourse(deps); // owned by u-lex
    await seedUser(deps, USER_ID);

    const otherToken = deps.signer.sign({ userId: "u-mats", isAdmin: false, expMs: deps.clock.nowMs() + 60_000 });
    const otherCookie = buildSessionCookie(otherToken);
    const res = await makeCardsImportHandler(deps)(makeReq(otherCookie, validBody), ctx);
    expect(res.status).toBe(403);
  });

  it("AC9: owner gets 200 with candidates — never persists cards", async () => {
    await seedCourse(deps);
    deps.claude.nextCards = CANDIDATES;

    const res = await makeCardsImportHandler(deps)(makeReq(validCookie(deps), validBody), ctx);
    expect(res.status).toBe(200);
    const body = res.jsonBody as Record<string, unknown>;
    expect(Array.isArray(body.candidates)).toBe(true);
    expect((body.candidates as unknown[]).length).toBe(2);

    // Invariant 3: no cards persisted
    const stored = await deps.tables.listByPartition("cards", COURSE_ID);
    expect(stored.length).toBe(0);
  });

  it("AC10: admin can import to any course", async () => {
    await seedUser(deps, USER_ID); // u-lex must be in users table for cross-scan
    await seedCourse(deps); // owned by u-lex
    deps.claude.nextCards = CANDIDATES;

    const res = await makeCardsImportHandler(deps)(makeReq(adminCookie(deps), validBody), ctx);
    expect(res.status).toBe(200);
  });

  it("AC11: passes correct ExtractCardsInput to claude", async () => {
    await seedCourse(deps);
    deps.claude.nextCards = CANDIDATES;

    await makeCardsImportHandler(deps)(makeReq(validCookie(deps), validBody), ctx);

    const input = deps.claude.extractCardsInputs[0];
    expect(input.imageBase64).toBe("base64data");
    expect(input.mimeType).toBe("image/jpeg");
    expect(input.courseName).toBe("French 🇫🇷");
    expect(input.courseLanguage).toBe("fr-FR");
  });

  it("AC12: passes caller ui_language to claude when user row exists", async () => {
    await seedCourse(deps);
    await seedUser(deps);
    deps.claude.nextCards = CANDIDATES;

    await makeCardsImportHandler(deps)(makeReq(validCookie(deps), validBody), ctx);

    const input = deps.claude.extractCardsInputs[0];
    expect(input.uiLanguage).toBe("en");
  });

  it("AC13: returns 422 when Claude throws ClaudeJsonParseError", async () => {
    const { ClaudeJsonParseError } = await import("../shared/claude.js");
    await seedCourse(deps);
    deps.claude.nextError = new ClaudeJsonParseError("bad json", "{{not json");

    const res = await makeCardsImportHandler(deps)(makeReq(validCookie(deps), validBody), ctx);
    expect(res.status).toBe(422);
  });

  it("AC14: returns 502 when Claude throws a generic error", async () => {
    await seedCourse(deps);
    deps.claude.nextError = new Error("rate limit");

    const res = await makeCardsImportHandler(deps)(makeReq(validCookie(deps), validBody), ctx);
    expect(res.status).toBe(502);
  });

  it("AC14b: returns 413 when Claude throws an image-too-large error", async () => {
    await seedCourse(deps);
    deps.claude.nextError = new Error(
      '400 {"type":"error","error":{"type":"invalid_request_error","message":"messages.0.content.0.image.source.base64: image exceeds 5 MB maximum: 5725160 bytes > 5242880 bytes"}}',
    );

    const res = await makeCardsImportHandler(deps)(makeReq(validCookie(deps), validBody), ctx);
    expect(res.status).toBe(413);
  });

  it("AC15: course found via cross-user scan (owner different partition)", async () => {
    await seedUser(deps, "u-mats");
    await seedCourse(deps); // owned by u-lex
    deps.claude.nextCards = CANDIDATES;

    const res = await makeCardsImportHandler(deps)(makeReq(validCookie(deps), validBody), ctx);
    expect(res.status).toBe(200);
  });

  it("AC16: treats null method as POST (method ?? 'POST' branch)", async () => {
    await seedCourse(deps);
    deps.claude.nextCards = CANDIDATES;

    const req = { ...makeReq(validCookie(deps), validBody), method: null } as unknown as HttpRequest;
    const res = await makeCardsImportHandler(deps)(req, ctx);
    expect(res.status).toBe(200);
  });

  it("AC18: candidates include question_lang and answer_lang from Claude", async () => {
    await seedCourse(deps);
    deps.claude.nextCards = [
      { question: "the dog", answer: "le chien", distractors: ["le chat", "le cheval"], question_lang: "en", answer_lang: "fr-FR" },
    ];

    const res = await makeCardsImportHandler(deps)(makeReq(validCookie(deps), validBody), ctx);
    expect(res.status).toBe(200);
    const body = res.jsonBody as Record<string, unknown>;
    const candidates = body.candidates as Array<Record<string, unknown>>;
    expect(candidates[0].question_lang).toBe("en");
    expect(candidates[0].answer_lang).toBe("fr-FR");
  });

  it("AC17: skips caller's own row during cross-user scan (continue branch)", async () => {
    // u-mats is the caller; u-lex owns the course
    // Seed u-mats FIRST so the scanner hits u-mats before u-lex, triggering the continue
    await seedUser(deps, "u-mats");
    await seedUser(deps, USER_ID);
    await seedCourse(deps); // owned by u-lex

    const matsToken = deps.signer.sign({ userId: "u-mats", isAdmin: false, expMs: deps.clock.nowMs() + 60_000 });
    const matsCookie = buildSessionCookie(matsToken);
    deps.claude.nextCards = CANDIDATES;

    const res = await makeCardsImportHandler(deps)(makeReq(matsCookie, validBody), ctx);
    expect(res.status).toBe(403); // u-mats is not the owner (403), but scan did run and found the course
  });

  it("AC19: passes questionLang and answerLang to extractCards when provided", async () => {
    await seedCourse(deps);
    deps.claude.nextCards = CANDIDATES;

    const body = { ...validBody, questionLang: "fr", answerLang: "nl" };
    const res = await makeCardsImportHandler(deps)(makeReq(validCookie(deps), body), ctx);
    expect(res.status).toBe(200);

    const input = deps.claude.extractCardsInputs[0];
    expect(input.questionLang).toBe("fr");
    expect(input.answerLang).toBe("nl");
  });

  it("AC20: omits questionLang/answerLang when not provided", async () => {
    await seedCourse(deps);
    deps.claude.nextCards = CANDIDATES;

    await makeCardsImportHandler(deps)(makeReq(validCookie(deps), validBody), ctx);

    const input = deps.claude.extractCardsInputs[0];
    expect(input.questionLang).toBeNull();
    expect(input.answerLang).toBeNull();
  });

  it("AC21: rejects invalid questionLang (non-BCP-47)", async () => {
    await seedCourse(deps);
    const body = { ...validBody, questionLang: "not-valid-123" };
    const res = await makeCardsImportHandler(deps)(makeReq(validCookie(deps), body), ctx);
    expect(res.status).toBe(400);
  });

  it("AC22: rejects invalid answerLang (non-BCP-47)", async () => {
    await seedCourse(deps);
    const body = { ...validBody, answerLang: "!!!" };
    const res = await makeCardsImportHandler(deps)(makeReq(validCookie(deps), body), ctx);
    expect(res.status).toBe(400);
  });

  it("AC23: accepts empty string questionLang/answerLang (means not specified)", async () => {
    await seedCourse(deps);
    deps.claude.nextCards = CANDIDATES;

    const body = { ...validBody, questionLang: "", answerLang: "" };
    const res = await makeCardsImportHandler(deps)(makeReq(validCookie(deps), body), ctx);
    expect(res.status).toBe(200);

    const input = deps.claude.extractCardsInputs[0];
    expect(input.questionLang).toBeNull();
    expect(input.answerLang).toBeNull();
  });

  it("AC24: 502 path logs cards_import_claude_failed with diagnostic attrs", async () => {
    await seedCourse(deps);
    // Simulate a real Anthropic SDK error: an Error with a numeric .status
    const sdkErr = Object.assign(new Error("invalid x-api-key"), {
      name: "AuthenticationError",
      status: 401,
    });
    deps.claude.nextError = sdkErr;

    const res = await makeCardsImportHandler(deps)(makeReq(validCookie(deps), validBody), ctx);
    expect(res.status).toBe(502);

    const failures = deps.logger.records.filter(
      (r) => r.event === "cards_import_claude_failed",
    );
    expect(failures.length).toBe(1);
    const rec = failures[0];
    expect(rec.level).toBe("error");
    expect(rec.attrs).toBeDefined();
    expect(rec.attrs?.userId).toBe(USER_ID);
    expect(rec.attrs?.courseId).toBe(COURSE_ID);
    expect(rec.attrs?.mimeType).toBe("image/jpeg");
    expect(typeof rec.attrs?.payloadKB).toBe("number");
    expect(rec.attrs?.errorName).toBe("AuthenticationError");
    expect(rec.attrs?.status).toBe(401);
    // Security: never leak the API key, base64, or session token
    const serialized = JSON.stringify(rec.attrs ?? {});
    expect(serialized).not.toContain("base64data");
    expect(serialized).not.toMatch(/sk-ant-/);
  });

  it("AC25: 200 path does NOT log cards_import_claude_failed", async () => {
    await seedCourse(deps);
    deps.claude.nextCards = CANDIDATES;

    const res = await makeCardsImportHandler(deps)(makeReq(validCookie(deps), validBody), ctx);
    expect(res.status).toBe(200);

    const failures = deps.logger.records.filter(
      (r) => r.event === "cards_import_claude_failed",
    );
    expect(failures.length).toBe(0);
  });

  it("AC26: 422 (ClaudeJsonParseError) path does NOT log cards_import_claude_failed", async () => {
    const { ClaudeJsonParseError } = await import("../shared/claude.js");
    await seedCourse(deps);
    deps.claude.nextError = new ClaudeJsonParseError("bad json", "{{not json");

    const res = await makeCardsImportHandler(deps)(makeReq(validCookie(deps), validBody), ctx);
    expect(res.status).toBe(422);

    const failures = deps.logger.records.filter(
      (r) => r.event === "cards_import_claude_failed",
    );
    expect(failures.length).toBe(0);
  });

  it("AC27: 413 when image base64 exceeds 5 MB, with maxBytes/actualBytes in body", async () => {
    await seedCourse(deps);
    // 7_000_000 base64 chars > 5 MB cap — guard fires
    const overCap = { ...validBody, imageBase64: "A".repeat(7_000_000) };

    const res = await makeCardsImportHandler(deps)(makeReq(validCookie(deps), overCap), ctx);
    expect(res.status).toBe(413);
    const body = res.jsonBody as Record<string, unknown>;
    expect(body.error).toBe("Image too large");
    expect(body.maxBytes).toBe(5 * 1024 * 1024);
    expect(typeof body.actualBytes).toBe("number");
    expect(body.actualBytes as number).toBeGreaterThan(body.maxBytes as number);
  });

  it("AC28: 413 path does NOT call claude.extractCards", async () => {
    await seedCourse(deps);
    const overCap = { ...validBody, imageBase64: "A".repeat(7_000_000) };

    await makeCardsImportHandler(deps)(makeReq(validCookie(deps), overCap), ctx);

    expect(deps.claude.extractCardsInputs.length).toBe(0);
  });

  it("AC29: 413 path does NOT log cards_import_claude_failed", async () => {
    await seedCourse(deps);
    const overCap = { ...validBody, imageBase64: "A".repeat(7_000_000) };

    await makeCardsImportHandler(deps)(makeReq(validCookie(deps), overCap), ctx);

    const failures = deps.logger.records.filter(
      (r) => r.event === "cards_import_claude_failed",
    );
    expect(failures.length).toBe(0);
  });

  it("AC30: PDF up to 32 MB base64 passes the size guard (still hits Claude path)", async () => {
    await seedCourse(deps);
    deps.claude.nextCards = CANDIDATES;
    // 14_000_000 base64 chars — under the 32 MB PDF cap, over the 5 MB image cap
    const pdfBody = {
      courseId: COURSE_ID,
      imageBase64: "A".repeat(14_000_000),
      mimeType: "application/pdf" as const,
    };

    const res = await makeCardsImportHandler(deps)(makeReq(validCookie(deps), pdfBody), ctx);
    expect(res.status).not.toBe(413);
    expect(res.status).toBe(200);
  });

  it("AC31: 413 when image base64 is just over 5 MB (real-world scenario)", async () => {
    // Regression: a 5.46 MB photo arrives as ~5.7 M base64 chars. Decoded
    // size (4.3 MB) is under the cap, but Anthropic compares the base64
    // string length itself against 5 MB — so the guard must too.
    await seedCourse(deps);
    deps.claude.nextCards = CANDIDATES;
    // 5_725_000 chars: matches the user's actual failing image. Decoded
    // bytes ≈ 4_293_750 — under 5 MB. Base64 length — over 5 MB.
    const realCase = { ...validBody, imageBase64: "A".repeat(5_725_000) };

    const res = await makeCardsImportHandler(deps)(makeReq(validCookie(deps), realCase), ctx);
    expect(res.status).toBe(413);
    expect(deps.claude.extractCardsInputs.length).toBe(0);
  });

  it("AC32: verifyCardLanguages is called when both questionLang and answerLang differ", async () => {
    await seedCourse(deps);
    deps.claude.nextCards = CANDIDATES;

    const body = { ...validBody, questionLang: "nl", answerLang: "fr" };
    const res = await makeCardsImportHandler(deps)(makeReq(validCookie(deps), body), ctx);
    expect(res.status).toBe(200);

    expect(deps.claude.verifyInputs.length).toBe(1);
    const vi = deps.claude.verifyInputs[0];
    expect(vi.questionLang).toBe("nl");
    expect(vi.answerLang).toBe("fr");
    expect(vi.cards).toEqual(CANDIDATES);
  });

  it("AC33: verifyCardLanguages is NOT called when only questionLang is provided", async () => {
    await seedCourse(deps);
    deps.claude.nextCards = CANDIDATES;

    const body = { ...validBody, questionLang: "nl" };
    const res = await makeCardsImportHandler(deps)(makeReq(validCookie(deps), body), ctx);
    expect(res.status).toBe(200);
    expect(deps.claude.verifyInputs.length).toBe(0);
  });

  it("AC34: response contains the swapped output from verifyCardLanguages", async () => {
    await seedCourse(deps);
    deps.claude.nextCards = [
      { question: "le chien", answer: "de hond", distractors: ["de kat", "de vogel"], question_lang: "nl", answer_lang: "fr" },
    ];
    deps.claude.nextVerifiedCards = [
      { question: "de hond", answer: "le chien", distractors: ["le chat", "le pigeon"], question_lang: "nl", answer_lang: "fr" },
    ];

    const body = { ...validBody, questionLang: "nl", answerLang: "fr" };
    const res = await makeCardsImportHandler(deps)(makeReq(validCookie(deps), body), ctx);
    expect(res.status).toBe(200);

    const responseBody = res.jsonBody as Record<string, unknown>;
    const candidates = responseBody.candidates as Array<Record<string, unknown>>;
    expect(candidates[0].question).toBe("de hond");
    expect(candidates[0].answer).toBe("le chien");
  });

  it("AC36: verifyCardLanguages is NOT called when questionLang and answerLang are the same", async () => {
    await seedCourse(deps);
    deps.claude.nextCards = CANDIDATES;

    const body = { ...validBody, questionLang: "fr", answerLang: "fr" };
    const res = await makeCardsImportHandler(deps)(makeReq(validCookie(deps), body), ctx);
    expect(res.status).toBe(200);
    expect(deps.claude.verifyInputs.length).toBe(0);
  });

  it("AC35: returns 502 when verifyCardLanguages throws a generic error", async () => {
    await seedCourse(deps);
    deps.claude.nextCards = CANDIDATES;
    deps.claude.nextVerifyError = new Error("verify rate limit");

    const body = { ...validBody, questionLang: "nl", answerLang: "fr" };
    const res = await makeCardsImportHandler(deps)(makeReq(validCookie(deps), body), ctx);
    expect(res.status).toBe(502);
  });

  it("AC37: passes extraInstructions to extractCards when provided", async () => {
    await seedCourse(deps);
    deps.claude.nextCards = CANDIDATES;

    const body = { ...validBody, extraInstructions: "only nouns, full sentences" };
    const res = await makeCardsImportHandler(deps)(makeReq(validCookie(deps), body), ctx);
    expect(res.status).toBe(200);

    const input = deps.claude.extractCardsInputs[0];
    expect(input.extraInstructions).toBe("only nouns, full sentences");
  });

  it("AC38: rejects extraInstructions longer than 1000 chars", async () => {
    await seedCourse(deps);
    const body = { ...validBody, extraInstructions: "x".repeat(1001) };
    const res = await makeCardsImportHandler(deps)(makeReq(validCookie(deps), body), ctx);
    expect(res.status).toBe(400);
    expect(deps.claude.extractCardsInputs.length).toBe(0);
  });

  it("AC39: rejects non-string extraInstructions", async () => {
    await seedCourse(deps);
    const body = { ...validBody, extraInstructions: 123 };
    const res = await makeCardsImportHandler(deps)(makeReq(validCookie(deps), body), ctx);
    expect(res.status).toBe(400);
    expect(deps.claude.extractCardsInputs.length).toBe(0);
  });

  it("AC40: omits extraInstructions when not provided", async () => {
    await seedCourse(deps);
    deps.claude.nextCards = CANDIDATES;

    await makeCardsImportHandler(deps)(makeReq(validCookie(deps), validBody), ctx);

    const input = deps.claude.extractCardsInputs[0];
    expect(input.extraInstructions).toBeNull();
  });

  it("AC41: treats empty string extraInstructions as not specified", async () => {
    await seedCourse(deps);
    deps.claude.nextCards = CANDIDATES;

    const body = { ...validBody, extraInstructions: "" };
    const res = await makeCardsImportHandler(deps)(makeReq(validCookie(deps), body), ctx);
    expect(res.status).toBe(200);

    const input = deps.claude.extractCardsInputs[0];
    expect(input.extraInstructions).toBeNull();
  });

  it("AC42: accepts extraInstructions of exactly 1000 chars", async () => {
    await seedCourse(deps);
    deps.claude.nextCards = CANDIDATES;

    const body = { ...validBody, extraInstructions: "x".repeat(1000) };
    const res = await makeCardsImportHandler(deps)(makeReq(validCookie(deps), body), ctx);
    expect(res.status).toBe(200);

    const input = deps.claude.extractCardsInputs[0];
    expect((input.extraInstructions as string).length).toBe(1000);
  });

  it("AC82: accepts pptx mimeType and routes through extractCardsFromSlides", async () => {
    await seedCourse(deps);
    await seedUser(deps);
    deps.claude.nextCards = CANDIDATES;

    const imageBase64 = await buildPptxBase64([
      { index: 1, slideRuns: ["Bonjour"], notesRuns: ["French for hello"] },
    ]);
    const body = { courseId: COURSE_ID, imageBase64, mimeType: PPTX_MIME };

    const res = await makeCardsImportHandler(deps)(makeReq(validCookie(deps), body), ctx);

    expect(res.status).toBe(200);
    expect(res.jsonBody).toMatchObject({ candidates: CANDIDATES });
    expect(deps.claude.extractCardsFromSlidesInputs).toHaveLength(1);
    expect(deps.claude.extractCardsInputs).toHaveLength(0);
  });

  it("AC83: returns 400 with parse_error for a corrupt pptx", async () => {
    await seedCourse(deps);
    await seedUser(deps);

    const imageBase64 = Buffer.from("definitely not a zip").toString("base64");
    const body = { courseId: COURSE_ID, imageBase64, mimeType: PPTX_MIME };

    const res = await makeCardsImportHandler(deps)(makeReq(validCookie(deps), body), ctx);

    expect(res.status).toBe(400);
    expect((res.jsonBody as { error: string }).error).toMatch(/pptx/i);
  });

  it("AC84: returns 413 for an oversize pptx payload", async () => {
    await seedCourse(deps);
    await seedUser(deps);

    // Construct a base64 string just over the 32MB cap without doing real work
    const imageBase64 = "A".repeat(32 * 1024 * 1024 + 1);
    const body = { courseId: COURSE_ID, imageBase64, mimeType: PPTX_MIME };

    const res = await makeCardsImportHandler(deps)(makeReq(validCookie(deps), body), ctx);

    expect(res.status).toBe(413);
  });

  it("AC85: forwards extraInstructions to extractCardsFromSlides for pptx", async () => {
    await seedCourse(deps);
    await seedUser(deps);
    deps.claude.nextCards = CANDIDATES;

    const imageBase64 = await buildPptxBase64([{ index: 1, slideRuns: ["Hola"] }]);
    const body = {
      courseId: COURSE_ID,
      imageBase64,
      mimeType: PPTX_MIME,
      extraInstructions: "Only nouns",
    };

    const res = await makeCardsImportHandler(deps)(makeReq(validCookie(deps), body), ctx);

    expect(res.status).toBe(200);
    expect(deps.claude.extractCardsFromSlidesInputs[0].extraInstructions).toBe("Only nouns");
  });

  it("AC86: reports image-only slides in skippedSlides response field", async () => {
    await seedCourse(deps);
    await seedUser(deps);
    deps.claude.nextCards = CANDIDATES;

    const imageBase64 = await buildPptxBase64([
      { index: 1, slideRuns: ["Has text"] },
      { index: 2, slideRuns: [] }, // image-only
      { index: 3, slideRuns: ["More text"] },
      { index: 4, slideRuns: [] }, // image-only
    ]);
    const body = { courseId: COURSE_ID, imageBase64, mimeType: PPTX_MIME };

    const res = await makeCardsImportHandler(deps)(makeReq(validCookie(deps), body), ctx);

    expect(res.status).toBe(200);
    expect((res.jsonBody as { skippedSlides: number[] }).skippedSlides).toEqual([2, 4]);
  });

  it("AC88: pptx path also runs language verification when Q≠A langs differ", async () => {
    await seedCourse(deps);
    await seedUser(deps);
    deps.claude.nextCards = CANDIDATES;

    const imageBase64 = await buildPptxBase64([{ index: 1, slideRuns: ["Hola"] }]);
    const body = {
      courseId: COURSE_ID,
      imageBase64,
      mimeType: PPTX_MIME,
      questionLang: "en",
      answerLang: "es",
    };

    const res = await makeCardsImportHandler(deps)(makeReq(validCookie(deps), body), ctx);

    expect(res.status).toBe(200);
    expect(deps.claude.verifyInputs).toHaveLength(1);
  });

  it("AC89: pptx path returns 502 when Claude fails after slide extraction", async () => {
    await seedCourse(deps);
    await seedUser(deps);
    deps.claude.nextError = new Error("Claude rate limit");

    const imageBase64 = await buildPptxBase64([{ index: 1, slideRuns: ["Hola"] }]);
    const body = { courseId: COURSE_ID, imageBase64, mimeType: PPTX_MIME };

    const res = await makeCardsImportHandler(deps)(makeReq(validCookie(deps), body), ctx);

    expect(res.status).toBe(502);
  });

  it("AC87: extractCardsFromSlidesInputs records slides shape with correct count and content", async () => {
    await seedCourse(deps);
    await seedUser(deps);
    deps.claude.nextCards = CANDIDATES;

    const imageBase64 = await buildPptxBase64([
      { index: 1, slideRuns: ["Bonjour"], notesRuns: ["hello"] },
      { index: 2, slideRuns: ["Au revoir"], notesRuns: ["goodbye"] },
    ]);
    const body = { courseId: COURSE_ID, imageBase64, mimeType: PPTX_MIME };

    await makeCardsImportHandler(deps)(makeReq(validCookie(deps), body), ctx);

    const input = deps.claude.extractCardsFromSlidesInputs[0];
    expect(input.slides).toHaveLength(2);
    expect(input.slides[0]).toEqual({ index: 1, text: "Bonjour", notes: "hello" });
    expect(input.slides[1]).toEqual({ index: 2, text: "Au revoir", notes: "goodbye" });
    expect(input.courseName).toBe("French 🇫🇷");
    expect(input.courseLanguage).toBe("fr-FR");
  });
});
