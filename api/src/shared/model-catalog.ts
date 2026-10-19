/**
 * Pure drift logic for the weekly "Model watch" check (spec #7): given the
 * Models API listing, is a newer Sonnet or Haiku available than the pins in
 * `claude.ts`? No I/O — the CLI in `api/scripts/check-latest-models.ts` lists
 * the models and passes them in.
 */

export type Family = "sonnet" | "haiku";

export interface ListedModel {
  id: string;
  /** RFC 3339 release timestamp from the Models API. */
  created_at: string;
}

export interface StaleFamily {
  family: Family;
  pinned: string;
  /** The newest listed model of the family, or null when none is listed. */
  newest: string | null;
  reason: "newer" | "pin-missing";
}

const FAMILIES: readonly Family[] = ["sonnet", "haiku"];

function inFamily(model: ListedModel, family: Family): boolean {
  return model.id.startsWith(`claude-${family}-`);
}

function releasedAt(model: ListedModel): number {
  return Date.parse(model.created_at);
}

/**
 * The most recently released model of a family (matched by id prefix only,
 * so opus / fable / mythos never qualify). Ties on `created_at` go to the
 * lexically greater id, so the answer does not depend on listing order.
 */
export function pickNewest(models: readonly ListedModel[], family: Family): ListedModel | null {
  let best: ListedModel | null = null;
  for (const m of models) {
    if (!inFamily(m, family)) continue;
    if (
      best === null ||
      releasedAt(m) > releasedAt(best) ||
      (releasedAt(m) === releasedAt(best) && m.id > best.id)
    ) {
      best = m;
    }
  }
  return best;
}

/**
 * Families whose pin is behind: a strictly newer model of the family exists,
 * or the pinned id is no longer listed at all. A dated and an undated id of the
 * same release share `created_at`, so neither counts as newer than the other.
 */
export function findStale(
  pinned: Record<Family, string>,
  models: readonly ListedModel[],
): StaleFamily[] {
  const stale: StaleFamily[] = [];
  for (const family of FAMILIES) {
    const pin = pinned[family];
    const newest = pickNewest(models, family);
    const pinEntry = models.find((m) => m.id === pin);
    if (!pinEntry) {
      stale.push({ family, pinned: pin, newest: newest?.id ?? null, reason: "pin-missing" });
    } else if (newest && releasedAt(newest) > releasedAt(pinEntry)) {
      stale.push({ family, pinned: pin, newest: newest.id, reason: "newer" });
    }
  }
  return stale;
}

const LABEL: Record<Family, string> = { sonnet: "Sonnet", haiku: "Haiku" };

/** Markdown body for the "Newer Claude model available" issue; "" when nothing is stale. */
export function formatIssueBody(stale: readonly StaleFamily[]): string {
  if (stale.length === 0) return "";
  const lines = stale.map((s) => {
    if (s.reason === "newer") {
      return `- **${LABEL[s.family]}**: pinned \`${s.pinned}\`, newest \`${s.newest}\``;
    }
    const newest = s.newest ? `newest listed is \`${s.newest}\`` : `no claude-${s.family} model is listed`;
    return `- **${LABEL[s.family]}**: pinned \`${s.pinned}\` is no longer listed by the Models API; ${newest}`;
  });
  return [
    "The weekly Model watch check found a Claude model newer than the one pinned in `api/src/shared/claude.ts`:",
    "",
    ...lines,
    "",
    "Each model generation can change the API (thinking defaults, rejected parameters, refusals), so a bump is",
    "a small spec, not an ID swap: write it with `/lexiquest-spec`, following what",
    "`docs/specs/7-latest-claude-models.md` checked for the 5.5 move.",
  ].join("\n");
}

export interface ModelReport {
  pinned: Record<Family, string>;
  newest: Record<Family, string | null>;
  stale: StaleFamily[];
  issueBody: string;
}

/** Everything the Model watch CLI prints, from the pins and one Models API listing. */
export function buildReport(
  pinned: Record<Family, string>,
  models: readonly ListedModel[],
): ModelReport {
  const stale = findStale(pinned, models);
  return {
    pinned,
    newest: {
      sonnet: pickNewest(models, "sonnet")?.id ?? null,
      haiku: pickNewest(models, "haiku")?.id ?? null,
    },
    stale,
    issueBody: formatIssueBody(stale),
  };
}
