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
import type { SessionRow } from "./sessions-shared.js";
import type { AttemptRow } from "./attempts-shared.js";
import {
  masteryBucket,
  groupByDay,
  parseRange,
  fetchAttempts,
  fetchSessions,
} from "../shared/aggregate.js";

export interface StatsCourseDeps {
  tables: TableStorage;
  signer: SessionSigner;
  clock: Clock;
}

export function makeStatsCourseHandler(deps: StatsCourseDeps): HttpHandler {
  return async (req: HttpRequest): Promise<HttpResponseInit> => {
    if ((req.method ?? "GET").toUpperCase() !== "GET") {
      return { status: 405, jsonBody: { error: "method not allowed" } };
    }

    const auth = requireAuth(req, deps);
    if (!auth.ok) return auth.response;

    const params = (req as unknown as { params?: Record<string, string> }).params;
    const courseId = params?.courseId ?? "";

    // Find the course across all user partitions (family visibility)
    const course = await findCourseAnywhere(deps.tables, auth.auth.userId, courseId);
    if (!course) return { status: 404, jsonBody: { error: "course not found" } };

    const courseOwnerId = course.user_id;
    const rangeParam = (req.query as { get(k: string): string | null }).get("range");
    const now = deps.clock.now();
    const { from, to } = parseRange(rangeParam, now);

    // Fetch data filtered to this course's owner and course
    const [allSessions, rangedAttempts, courseCards] = await Promise.all([
      deps.tables.listByPartition<SessionRow>("sessions", courseOwnerId),
      fetchAttempts(deps.tables, courseOwnerId, from, to),
      deps.tables.listByPartition<CardRow>("cards", courseId),
    ]);

    const allCourseSessions = allSessions.filter((s) => s.course_id === courseId);
    const rangedCourseSessions = await fetchSessions(deps.tables, courseOwnerId, from, to)
      .then((ss) => ss.filter((s) => s.course_id === courseId));

    // Trend data scoped to this course
    const sessionsByDay = groupByDay(rangedCourseSessions, (s) => s.started_at);

    const sessionsPerDay = Object.entries(sessionsByDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, sessions]) => ({ date, count: sessions.length }));

    const accuracyTrend = Object.entries(sessionsByDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, sessions]) => {
        const studied = sessions.reduce((s, x) => s + x.cards_studied, 0);
        const correct = sessions.reduce((s, x) => s + x.cards_correct, 0);
        return { date, pctFirstTry: studied > 0 ? Math.round((correct / studied) * 100) : 0 };
      });

    const dailyXp = Object.entries(sessionsByDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, sessions]) => ({ date, xp: sessions.reduce((s, x) => s + x.xp_earned, 0) }));

    let cumXp = 0;
    const xpOverTime = dailyXp.map(({ date, xp }) => {
      cumXp += xp;
      return { date, cumulativeXp: cumXp };
    });

    const timeStudiedPerDay = Object.entries(sessionsByDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, sessions]) => ({
        date,
        minutes: sessions.reduce((s, x) => s + x.duration_seconds, 0) / 60,
      }));

    // Card struggle list: count fails per card from all attempts (no range filter for struggle list)
    const allCourseAttempts = rangedAttempts.filter(
      (a) => courseCards.some((c) => c.rowKey === a.card_id),
    );
    const failCounts = new Map<string, number>();
    for (const a of allCourseAttempts) {
      if (!a.correct) {
        failCounts.set(a.card_id, (failCounts.get(a.card_id) ?? 0) + 1);
      }
    }
    const cardById = new Map<string, CardRow>(courseCards.map((c) => [c.rowKey, c]));
    const cardStruggleList = Array.from(failCounts.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20)
      .map(([cardId, failCount]) => ({
        cardId,
        question: cardById.get(cardId)?.question ?? "",
        failCount,
      }));

    // Mastery distribution for this course
    const masteryDistribution = { new: 0, learning: 0, young: 0, mature: 0, mastered: 0 };
    for (const card of courseCards) {
      masteryDistribution[masteryBucket(card)]++;
    }

    // Totals for this course
    const totalSessions = allCourseSessions.length;
    const totalCardsStudied = allCourseSessions.reduce((s, x) => s + x.cards_studied, 0);
    const totalMinutes = allCourseSessions.reduce((s, x) => s + x.duration_seconds, 0) / 60;

    return {
      status: 200,
      headers: { "Cache-Control": "private, max-age=60" },
      jsonBody: {
        totalSessions,
        totalCardsStudied,
        totalMinutes,
        accuracyTrend,
        xpOverTime,
        dailyXp,
        sessionsPerDay,
        timeStudiedPerDay,
        masteryDistribution,
        cardStruggleList,
      },
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
export function registerStatsCourse(deps: StatsCourseDeps): void {
  app.http("stats-course", {
    route: "stats/course/{courseId}",
    methods: ["GET"],
    authLevel: "anonymous",
    handler: makeStatsCourseHandler(deps),
  });
}
/* v8 ignore stop */
