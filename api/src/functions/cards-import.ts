import {
  app,
  type HttpHandler,
  type HttpRequest,
  type HttpResponseInit,
} from "@azure/functions";
import { requireAuth } from "../shared/auth.js";
import type { Clock } from "../shared/clock.js";
import type { Logger } from "../shared/logger.js";
import type { SessionSigner } from "../shared/session-signer.js";
import type { TableStorage } from "../shared/table-storage.js";
import { PARTITIONS } from "../shared/table-partitions.js";
import type { UserRow } from "../shared/seed.js";
import type { ClaudeClient, ExtractCardsInput, VerifyLanguagesInput } from "../shared/claude.js";
import { ClaudeJsonParseError, HAIKU_MODEL, SONNET_MODEL } from "../shared/claude.js";
import { extractSlidesFromPptx, PptxParseError } from "../shared/pptx-extractor.js";
import type { CourseRow } from "./courses-shared.js";

export interface CardsImportDeps {
  tables: TableStorage;
  signer: SessionSigner;
  clock: Clock;
  claude: ClaudeClient;
  logger: Logger;
}

const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

const VALID_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  PPTX_MIME,
]);

// Anthropic enforces these caps against the base64 string length
// (request payload size), not the decoded image/PDF bytes.
// PPTX is parsed locally (text-only) so we use the larger PDF cap —
// study decks routinely run 10–20 MB once embedded images are included.
const MAX_IMAGE_PAYLOAD_BYTES = 5 * 1024 * 1024;
const MAX_PDF_PAYLOAD_BYTES = 32 * 1024 * 1024;
const MAX_PPTX_PAYLOAD_BYTES = 32 * 1024 * 1024;

const BCP47_RE = /^[a-z]{2,3}(-[A-Z][a-zA-Z]{1,7})?$/;

const MAX_EXTRA_INSTRUCTIONS_LENGTH = 1000;

type AnyImportMimeType = ExtractCardsInput["mimeType"] | typeof PPTX_MIME;

interface ValidatedImportBody {
  courseId: string;
  imageBase64: string;
  mimeType: AnyImportMimeType;
  questionLang?: string;
  answerLang?: string;
  extraInstructions?: string;
}

function validateBody(
  body: unknown,
): { ok: true } & ValidatedImportBody | { ok: false; error: string } {
  if (body === null || typeof body !== "object") {
    return { ok: false, error: "body must be an object" };
  }
  const src = body as Record<string, unknown>;
  if (typeof src.courseId !== "string" || src.courseId.trim().length === 0) {
    return { ok: false, error: "courseId is required" };
  }
  if (typeof src.imageBase64 !== "string" || src.imageBase64.length === 0) {
    return { ok: false, error: "imageBase64 is required" };
  }
  if (typeof src.mimeType !== "string" || !VALID_MIME_TYPES.has(src.mimeType)) {
    return {
      ok: false,
      error:
        "mimeType must be image/jpeg, image/png, image/webp, image/gif, application/pdf, or application/vnd.openxmlformats-officedocument.presentationml.presentation",
    };
  }

  const result: ValidatedImportBody = {
    courseId: src.courseId.trim(),
    imageBase64: src.imageBase64,
    mimeType: src.mimeType as AnyImportMimeType,
  };

  if (typeof src.questionLang === "string" && src.questionLang.length > 0) {
    if (!BCP47_RE.test(src.questionLang)) {
      return { ok: false, error: "questionLang must be a valid BCP-47 code (e.g. en, fr, nl)" };
    }
    result.questionLang = src.questionLang;
  }
  if (typeof src.answerLang === "string" && src.answerLang.length > 0) {
    if (!BCP47_RE.test(src.answerLang)) {
      return { ok: false, error: "answerLang must be a valid BCP-47 code (e.g. en, fr, nl)" };
    }
    result.answerLang = src.answerLang;
  }

  if ("extraInstructions" in src && src.extraInstructions !== undefined && src.extraInstructions !== null) {
    if (typeof src.extraInstructions !== "string") {
      return { ok: false, error: "extraInstructions must be a string" };
    }
    if (src.extraInstructions.length > MAX_EXTRA_INSTRUCTIONS_LENGTH) {
      return {
        ok: false,
        error: `extraInstructions must be ${MAX_EXTRA_INSTRUCTIONS_LENGTH} characters or fewer`,
      };
    }
    if (src.extraInstructions.length > 0) {
      result.extraInstructions = src.extraInstructions;
    }
  }

  return { ok: true, ...result };
}

async function findCourseById(
  tables: TableStorage,
  callerUserId: string,
  courseId: string,
): Promise<CourseRow | null> {
  const own = await tables.getById<CourseRow>("courses", callerUserId, courseId);
  if (own) return own;
  const users = await tables.listByPartition<UserRow>("users", PARTITIONS.users);
  for (const u of users) {
    if (u.rowKey === callerUserId) continue;
    const hit = await tables.getById<CourseRow>("courses", u.rowKey, courseId);
    if (hit) return hit;
  }
  return null;
}

export function makeCardsImportHandler(deps: CardsImportDeps): HttpHandler {
  return async (req: HttpRequest): Promise<HttpResponseInit> => {
    const method = (req.method ?? "POST").toUpperCase();
    if (method !== "POST") {
      return { status: 405, jsonBody: { error: "method not allowed" } };
    }

    const auth = requireAuth(req, deps);
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => null);
    const validated = validateBody(body);
    if (!validated.ok) {
      return { status: 400, jsonBody: { error: validated.error } };
    }
    const { courseId, imageBase64, mimeType, questionLang, answerLang, extraInstructions } = validated;

    const isPdf = mimeType === "application/pdf";
    const isPptx = mimeType === PPTX_MIME;
    const payloadBytes = imageBase64.length;
    const maxBytes = isPptx
      ? MAX_PPTX_PAYLOAD_BYTES
      : isPdf
        ? MAX_PDF_PAYLOAD_BYTES
        : MAX_IMAGE_PAYLOAD_BYTES;
    if (payloadBytes > maxBytes) {
      return {
        status: 413,
        jsonBody: { error: "Image too large", maxBytes, actualBytes: payloadBytes },
      };
    }

    const course = await findCourseById(deps.tables, auth.auth.userId, courseId);
    if (!course) {
      return { status: 404, jsonBody: { error: "course not found" } };
    }

    const isOwner = course.user_id === auth.auth.userId;
    if (!isOwner && !auth.auth.isAdmin) {
      return { status: 403, jsonBody: { error: "forbidden" } };
    }

    // Fetch caller's ui_language — fall back to "en" if row not found
    const userRow = await deps.tables.getById<UserRow>("users", PARTITIONS.users, auth.auth.userId);
    const uiLanguage = userRow?.ui_language ?? "en";

    if (isPptx) {
      let slides;
      try {
        slides = await extractSlidesFromPptx(Buffer.from(imageBase64, "base64"));
      } catch (err) {
        if (err instanceof PptxParseError) {
          return { status: 400, jsonBody: { error: `pptx ${err.message}` } };
        }
        throw err;
      }

      try {
        let candidates = await deps.claude.extractCardsFromSlides({
          slides,
          courseName: course.name,
          courseLanguage: course.language,
          uiLanguage,
          questionLang: questionLang ?? null,
          answerLang: answerLang ?? null,
          extraInstructions: extraInstructions ?? null,
        });

        if (questionLang && answerLang && questionLang !== answerLang) {
          candidates = await deps.claude.verifyCardLanguages({
            cards: candidates,
            questionLang,
            answerLang,
          });
        }

        const skippedSlides = slides.filter((s) => !s.text).map((s) => s.index);
        return { status: 200, jsonBody: { candidates, skippedSlides } };
      } catch (err) {
        return handleClaudeError(err, deps.logger, auth.auth.userId, courseId, mimeType, imageBase64);
      }
    }

    try {
      let candidates = await deps.claude.extractCards({
        imageBase64,
        mimeType,
        courseName: course.name,
        courseLanguage: course.language,
        uiLanguage,
        questionLang: questionLang ?? null,
        answerLang: answerLang ?? null,
        extraInstructions: extraInstructions ?? null,
        // PDFs are chunked client-side into small page batches; use the faster
        // model so each request stays under the SWA 45s cap. Images keep Sonnet.
        model: isPdf ? HAIKU_MODEL : SONNET_MODEL,
      });

      if (questionLang && answerLang && questionLang !== answerLang) {
        candidates = await deps.claude.verifyCardLanguages({
          cards: candidates,
          questionLang,
          answerLang,
        });
      }

      return { status: 200, jsonBody: { candidates } };
    } catch (err) {
      return handleClaudeError(err, deps.logger, auth.auth.userId, courseId, mimeType, imageBase64);
    }
  };
}

function handleClaudeError(
  err: unknown,
  logger: Logger,
  userId: string,
  courseId: string,
  mimeType: string,
  imageBase64: string,
): HttpResponseInit {
  if (err instanceof ClaudeJsonParseError) {
    return { status: 422, jsonBody: { error: "Claude returned unparseable JSON", raw: err.raw } };
  }
  const errorName = err instanceof Error ? err.name : "unknown";
  const errorMessage = err instanceof Error ? err.message : String(err);
  const sdkStatus = (err as { status?: unknown })?.status;
  logger.error("cards_import_claude_failed", {
    userId,
    courseId,
    mimeType,
    payloadKB: Math.round((imageBase64.length * 0.75) / 1024),
    errorName,
    errorMessage,
    status: typeof sdkStatus === "number" ? sdkStatus : null,
  });
  if (errorMessage.includes("image exceeds")) {
    return { status: 413, jsonBody: { error: "image too large" } };
  }
  return { status: 502, jsonBody: { error: "Claude request failed" } };
}

/* v8 ignore start */
export function registerCardsImport(deps: CardsImportDeps): void {
  app.http("cards-import", {
    route: "cards/import",
    methods: ["POST"],
    authLevel: "anonymous",
    handler: makeCardsImportHandler(deps),
  });
}
/* v8 ignore stop */
