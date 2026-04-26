import {
  app,
  type HttpHandler,
  type HttpRequest,
  type HttpResponseInit,
} from "@azure/functions";
import { requireAuth } from "../shared/auth.js";
import type { SessionSigner } from "../shared/session-signer.js";
import type { TableStorage } from "../shared/table-storage.js";
import type { Clock } from "../shared/clock.js";
import { PARTITIONS } from "../shared/table-partitions.js";
import type { UserRow } from "../shared/seed.js";
import type { CourseRow } from "./courses-shared.js";
import type { CardRow } from "./cards-shared.js";
import {
  masteryBucket,
  parseRange,
  fetchAttempts,
} from "../shared/aggregate.js";

export interface StatsUploadDeps {
  tables: TableStorage;
  signer: SessionSigner;
  clock: Clock;
}

interface UploadStats {
  uploadId: string;
  uploadName: string | null;
  cardCount: number;
  createdAt: string;
  masteryDistribution: Record<string, number>;
  avgEase: number;
  totalAttempts: number;
  correctAttempts: number;
  accuracyPct: number;
  lastStudiedAt: string | null;
}

export function makeStatsUploadHandler(deps: StatsUploadDeps): HttpHandler {
  return async (req: HttpRequest): Promise<HttpResponseInit> => {
    if ((req.method ?? "GET").toUpperCase() !== "GET") {
      return { status: 405, jsonBody: { error: "method not allowed" } };
    }

    const auth = requireAuth(req, deps);
    if (!auth.ok) return auth.response;

    const params = (req as unknown as { params?: Record<string, string> }).params;
    const courseId = params?.courseId ?? "";

    const course = await findCourseAnywhere(deps.tables, auth.auth.userId, courseId);
    if (!course) return { status: 404, jsonBody: { error: "course not found" } };

    const courseOwnerId = course.user_id;
    const rangeParam = (req.query as { get(k: string): string | null }).get("range");
    const now = deps.clock.now();
    const { from, to } = parseRange(rangeParam, now);

    const [courseCards, rangedAttempts] = await Promise.all([
      deps.tables.listByPartition<CardRow>("cards", courseId),
      fetchAttempts(deps.tables, courseOwnerId, from, to),
    ]);

    // Group cards by upload_id (skip manual cards)
    const uploadGroups = new Map<string, CardRow[]>();
    const cardToUpload = new Map<string, string>();
    for (const card of courseCards) {
      if (!card.upload_id) continue;
      let group = uploadGroups.get(card.upload_id);
      if (!group) {
        group = [];
        uploadGroups.set(card.upload_id, group);
      }
      group.push(card);
      cardToUpload.set(card.rowKey, card.upload_id);
    }

    // Bucket attempts into uploads
    const uploadAttempts = new Map<string, { total: number; correct: number; lastTs: string | null }>();
    for (const attempt of rangedAttempts) {
      const uploadId = cardToUpload.get(attempt.card_id);
      if (!uploadId) continue;
      let bucket = uploadAttempts.get(uploadId);
      if (!bucket) {
        bucket = { total: 0, correct: 0, lastTs: null };
        uploadAttempts.set(uploadId, bucket);
      }
      bucket.total++;
      if (attempt.correct) bucket.correct++;
      if (!bucket.lastTs || attempt.timestamp > bucket.lastTs) {
        bucket.lastTs = attempt.timestamp;
      }
    }

    // Build per-upload stats
    const uploads: UploadStats[] = [];
    for (const [uploadId, cards] of uploadGroups) {
      const distribution = { new: 0, learning: 0, young: 0, mature: 0, mastered: 0 };
      let easeSum = 0;
      let earliest = cards[0].created_at;
      let uploadName: string | null = null;

      for (const card of cards) {
        distribution[masteryBucket(card)]++;
        easeSum += card.sm2_ease;
        if (card.created_at < earliest) earliest = card.created_at;
        if (card.upload_name && !uploadName) uploadName = card.upload_name;
      }

      const attemptBucket = uploadAttempts.get(uploadId);
      const totalAttempts = attemptBucket?.total ?? 0;
      const correctAttempts = attemptBucket?.correct ?? 0;

      uploads.push({
        uploadId,
        uploadName,
        cardCount: cards.length,
        createdAt: earliest,
        masteryDistribution: distribution,
        avgEase: Math.round((easeSum / cards.length) * 100) / 100,
        totalAttempts,
        correctAttempts,
        accuracyPct: totalAttempts > 0 ? Math.round((correctAttempts / totalAttempts) * 100) : 0,
        lastStudiedAt: attemptBucket?.lastTs ?? null,
      });
    }

    // Sort: most recently studied first, nulls last
    uploads.sort((a, b) => {
      if (a.lastStudiedAt && b.lastStudiedAt) return b.lastStudiedAt.localeCompare(a.lastStudiedAt);
      if (a.lastStudiedAt && !b.lastStudiedAt) return -1;
      if (!a.lastStudiedAt && b.lastStudiedAt) return 1;
      return 0;
    });

    return {
      status: 200,
      headers: { "Cache-Control": "private, max-age=60" },
      jsonBody: { uploads },
    };
  };
}

async function findCourseAnywhere(
  tables: TableStorage,
  callerUserId: string,
  courseId: string,
): Promise<CourseRow | null> {
  const ownCourses = await tables.listByPartition<CourseRow>("courses", callerUserId);
  const found = ownCourses.find((c) => c.rowKey === courseId);
  if (found) return found;

  const users = await tables.listByPartition<UserRow>("users", PARTITIONS.users);
  for (const u of users) {
    if (u.rowKey === callerUserId) continue;
    const courses = await tables.listByPartition<CourseRow>("courses", u.rowKey);
    const hit = courses.find((c) => c.rowKey === courseId);
    if (hit) return hit;
  }
  return null;
}

/* v8 ignore start */
export function registerStatsUpload(deps: StatsUploadDeps): void {
  app.http("stats-upload", {
    route: "stats/course/{courseId}/uploads",
    methods: ["GET"],
    authLevel: "anonymous",
    handler: makeStatsUploadHandler(deps),
  });
}
/* v8 ignore stop */
