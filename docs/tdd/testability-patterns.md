# Testability Patterns — LexiQuest

The TDD methodology requires that every seam can be faked. This document
enumerates the seams LexiQuest has (or will have) and the exact shape they
take as injectable dependencies.

**Rule**: business logic never imports a side-effect module directly. It
accepts an interface via a parameter or a dependency object. For the API, the
composition root is the per-function handler entry; for the frontend, it is
`main.jsx` + `AppContext`. These are the *only* places real implementations
are constructed.

---

## 1. The composition root pattern

### API (TypeScript)

```ts
// api/cards-import/index.ts — the ONLY place real deps are constructed for this function.
import { app } from "@azure/functions";
import { createTableStorage } from "../shared/tables.js";
import { createClaudeClient } from "../shared/claude.js";
import { SystemClock } from "../shared/clock.js";
import { createJsonLogger } from "../shared/logger.js";
import { makeCardsImport } from "./handler.js";

const tables = createTableStorage(process.env.STORAGE_CONNECTION_STRING!);
const claude = createClaudeClient(process.env.ANTHROPIC_API_KEY!);
const clock = new SystemClock();
const logger = createJsonLogger(process.stdout);

app.http("cards-import", {
  methods: ["POST"],
  handler: makeCardsImport({ tables, claude, clock, logger }),
});
```

The `handler.ts` file below exports `makeCardsImport` as a pure factory — it
takes deps and returns the handler. `handler.test.ts` constructs it with
fakes.

### Frontend (JavaScript)

```jsx
// frontend/src/main.jsx — the ONLY place real browser deps are constructed.
import { AppProvider } from "./context/AppContext.jsx";
import { createApiClient } from "./lib/api.js";
import { createTts } from "./lib/tts.js";

const api = createApiClient(window.fetch.bind(window));
const tts = createTts(window.speechSynthesis);

ReactDOM.createRoot(document.getElementById("root")).render(
  <AppProvider api={api} tts={tts}>
    <App />
  </AppProvider>
);
```

Every screen / component below the provider reads deps from context via
`useApi()` / `useTts()`. Tests wrap the component in an `AppProvider` with
fakes.

---

## 2. The `Deps` object convention

For modules with more than 2 dependencies, group them into a `Deps` object:

```ts
// api/sessions/handler.ts
export interface StartSessionDeps {
  tables: TableStorage;
  clock: Clock;
  random: Random;
  logger: Logger;
}

export const makeStartSession = (deps: StartSessionDeps) =>
  async (userId: string, courseId: string, mode: SessionMode) => {
    // ...
  };
```

This pattern gives you:
- one place to add a new dependency without changing every call site
- trivially complete fakes in tests
- no hidden globals

---

## 3. The seams

### 3.1 Table Storage — `TableStorage`

**Real**: [`api/shared/tables.ts`](../../api/shared/tables.ts) — wraps
`@azure/data-tables`. The **only** file allowed to import `@azure/data-tables`.

Interface (sketch):

```ts
export interface TableStorage {
  getById<T>(table: TableName, partitionKey: string, rowKey: string): Promise<T | null>;
  listByPartition<T>(table: TableName, partitionKey: string): Promise<T[]>;
  listByRowKeyRange<T>(table: TableName, partitionKey: string, fromRowKey: string, toRowKey: string): Promise<T[]>;
  upsert<T>(table: TableName, entity: T & { partitionKey: string; rowKey: string }): Promise<void>;
  remove(table: TableName, partitionKey: string, rowKey: string): Promise<void>;
}

export type TableName = "users" | "years" | "courses" | "cards" | "attempts" | "sessions";
```

The real implementation:
- auto-creates tables on first call (idempotent)
- serializes JSON fields (`distractors`, `settings`) transparently
- translates storage-level errors into typed errors (`EntityNotFoundError`,
  `ConflictError`)

**Fake**: `api/testing/fake-table-storage.ts` — `Map<string, Map<string, T>>`
backed, supports `listByRowKeyRange` via key prefix comparison. Fast enough
that every unit test can start with an empty store.

**Contract test**: `api/shared/__contract__/tables.contract.test.ts` runs the
same assertion suite against (a) the fake and (b) the real client pointed at
[Azurite](https://learn.microsoft.com/azure/storage/common/storage-use-azurite),
ensuring the fake does not drift.

### 3.2 Claude client — `ClaudeClient`

**Real**: [`api/shared/claude.ts`](../../api/shared/claude.ts) — wraps
`@anthropic-ai/sdk`. The **only** file allowed to import it. All response
handling lives here:
- stripping markdown fences (` ```json ... ``` `) from the text
- parsing JSON, with a typed `ClaudeJsonParseError` on failure
- normalizing the shape to the project's `CardCandidate` type

Interface:

```ts
export interface ClaudeClient {
  extractCards(input: ExtractCardsInput): Promise<CardCandidate[]>;
  enrichDistractors(input: EnrichInput): Promise<Array<{ id: string; distractors: [string, string] }>>;
}
```

**Fake**: `api/testing/fake-claude-client.ts` — scripted per-test responses.
Supports:
- canned output (happy path)
- simulated markdown fences around the JSON
- simulated parse failures
- simulated rate limit / network errors

Business logic never reaches into the SDK; it speaks only the interface above.

### 3.3 Clock — `Clock`

**Interface**: `interface Clock { now(): number /* unix ms */; today(zone: string): string /* YYYY-MM-DD */ }`.

`today()` takes an IANA timezone because streak rollover is defined in the
user's timezone (Europe/Brussels for the Wauters family — see Design.md §5.7).

**Real**: `class SystemClock { now() { return Date.now(); } today(z) { return new Intl.DateTimeFormat("en-CA", { timeZone: z }).format(new Date()); } }`.

**Fake**: `FakeClock` — constructor takes an ISO string; `advance(ms)`,
`setDate(isoString)` step forward. See
[../../testing/examples/fake-clock.example.ts](../../testing/examples/fake-clock.example.ts).

Business logic NEVER calls `Date.now()` or `new Date()` directly. Audit rule:
grep for `Date\.now\(|new Date\(` outside `api/shared/clock.ts`,
`frontend/src/lib/clock.js`, and `*/testing/**`.

### 3.4 Password hasher — `PasswordHasher`

Wraps `bcryptjs` so tests can avoid the 100-ms cost per comparison and so no
other file imports it.

```ts
export interface PasswordHasher {
  hash(password: string): Promise<string>;
  compare(password: string, hash: string): Promise<boolean>;
}
```

**Real**: `api/shared/password-hasher.ts` — `bcryptjs` with a configured cost.

**Fake**: `FakePasswordHasher` — `hash(p) = "hash:" + p`, `compare(p, h) = h === "hash:" + p`. Not secure; never used outside tests. The real client's
compatibility is guaranteed by a contract test.

### 3.5 Session signer — `SessionSigner`

HMAC-SHA256 signing for the session cookie.

```ts
export interface SessionSigner {
  sign(payload: SessionPayload): string;        // returns `{base64-payload}.{base64-sig}`
  verify(token: string): SessionPayload;         // throws InvalidSessionError on tamper or expiry
}
export interface SessionPayload {
  userId: string;
  isAdmin: boolean;
  expUnixMs: number;
}
```

**Real**: `api/shared/session-signer.ts` — `node:crypto.createHmac("sha256", secret)`.
The **only** file allowed to import `node:crypto` for signing purposes.

**Fake**: `FakeSessionSigner` — signs with a constant suffix, verifies
trivially. Contract test pins the real behavior.

### 3.6 Random — `Random`

Used for: card shuffle, retry pile ordering, mixed-mode coin flip, ID
generation where UUIDs aren't required.

```ts
export interface Random {
  shuffle<T>(items: readonly T[]): T[];
  coinFlip(): boolean;
  uuid(): string;
}
```

**Real**: `api/shared/random.ts` / `frontend/src/lib/random.js` — wraps
`crypto.randomUUID()` and a Fisher-Yates shuffle seeded from `crypto.getRandomValues`.

**Fake**: `SeededRandom` — deterministic (seeded mulberry32). Tests assert
on exact post-shuffle order.

Business logic NEVER calls `Math.random()` directly. Grep rule.

### 3.7 Logger — `Logger`

```ts
export interface Logger {
  info(event: string, ctx?: Record<string, unknown>): void;
  warn(event: string, ctx?: Record<string, unknown>): void;
  error(event: string, ctx?: Record<string, unknown>): void;
}
```

**Real**: `api/shared/logger.ts` — writes JSON lines to stdout.

**Fake**: `ArrayLogger` — `{ entries: [] }`. Tests assert
`logger.entries.find(e => e.event === "session_closed")`. Never assert on
formatted strings; always on structured events.

### 3.8 API client (frontend) — `ApiClient`

```js
// frontend/src/lib/api.js
export const createApiClient = (fetchImpl) => ({
  login: (userId, password) => fetchImpl("/api/login", { ... }),
  me: () => fetchImpl("/api/me"),
  startSession: (courseId, mode) => fetchImpl("/api/sessions", { ... }),
  // ...
});
```

**Real**: wraps `window.fetch`.

**Fake**: `FakeApiClient` — plain object with the same methods returning
Promise-wrapped canned responses. Tests wrap screens in `<AppProvider api={fakeApi}>`.

Business logic NEVER calls `fetch()` directly.

### 3.9 TTS (frontend) — `Tts`

Wraps `window.speechSynthesis` so tests run headless.

```js
export const createTts = (speechSynthesis) => ({
  isAvailable: (lang) => /* ... */,
  speak: (text, lang, rate = 0.9) => /* ... */,
});
```

**Fake**: `FakeTts` — records calls, exposes `lastSpoken`. Tests assert on
recorded calls, never on actual audio output.

### 3.10 Storage keys — `IdSource`

Where row keys need to be stable and sortable (attempts, sessions: row-key =
`{isoTimestamp}_{uuid}` per Design.md §3.3):

```ts
export interface IdSource {
  uuid(): string;
  rowKeyForTimestamp(iso: string, id: string): string;
}
```

Real: wraps the `Random` seam + pure string formatting.
Fake: `SeededIdSource` — deterministic UUIDs for readable test output.

---

## 4. Checklist: is my new module testable?

Before writing a new source file, answer these. "No" to any = redesign.

- [ ] Does it accept its dependencies via a `Deps` object or function
      parameters, rather than importing them directly?
- [ ] Is every I/O primitive it uses (fetch, Table Storage, Claude SDK,
      clock, random, crypto, process.env) behind an interface?
- [ ] Can I construct an instance of it in a test using only fakes, with
      zero network / zero wall-clock reads / zero bcrypt rounds?
- [ ] Does every error it can throw have a typed class or a well-known error
      code a test can assert on?
- [ ] Can I exercise every branch of its logic from outside, without
      reaching into private state?

If all yes, it will be easy to test. If any no, fix the seam *before*
writing the RED test.

---

## 5. Anti-patterns banned in this repo

- `new Date()` / `Date.now()` in business logic → use `clock.now()`.
- `Math.random()` anywhere → seeded from `random`.
- `crypto.randomUUID()` outside `api/shared/random.ts` and
  `frontend/src/lib/random.js` → use `random.uuid()`.
- `process.env.X` outside `api/shared/config.ts` and per-function composition
  roots → config is loaded once and passed as a value.
- `fetch(...)` outside `frontend/src/lib/api.js` and `api/shared/claude.ts`.
- `import("@azure/data-tables")` outside `api/shared/tables.ts`.
- `import("@anthropic-ai/sdk")` outside `api/shared/claude.ts`.
- `import("bcryptjs")` outside `api/shared/password-hasher.ts`.
- `require(...)` dynamic imports → ESM only, static imports.
- Singletons (`let instance: X | undefined`) → always pass the instance as a
  dependency.

A meta-test in `api/__meta__/seam-boundaries.test.ts` (written in the first
slice that introduces more than one seam) greps the codebase for these
patterns and fails if found outside their allowlist.

---

## 6. LexiQuest-specific invariants

These four rules have architectural weight. They are enforced both in code
review and by specific tests.

### 6.1 `user_id` is derived from the session, never from the request body

Every protected API endpoint MUST read `userId` from
`requireAuth(req).userId`. The request body's `userId` (if present) is
ignored or rejected.

Enforcement:
- `api/__meta__/auth-boundary.test.ts` scans every handler under
  `api/*/handler.ts` and asserts it does not reference `req.body.userId` or
  `body.user_id` anywhere.
- Per-handler tests assert: given a session cookie for user A and a body
  naming user B, the created resource belongs to user A.

### 6.2 Stats endpoints return aggregates only

Endpoints under `api/stats-*/` MUST NOT return raw `attempts` or `sessions`
rows belonging to a user other than the caller. Aggregates only.

Enforcement:
- `api/__meta__/stats-privacy.test.ts` asserts the response shape of every
  stats endpoint matches a declared "aggregates-only" schema (no raw timestamps,
  no per-attempt objects for userId ≠ caller).
- Per-endpoint tests assert: given 100 attempts for user B, a stats call by
  user A returns counts/buckets — never the attempt objects.

### 6.3 AI import always routes through Import Review

`POST /api/cards/import` returns **card candidates**, never persists them.
Persistence happens via `POST /api/cards/batch` after user confirmation in
the Import Review screen.

Enforcement:
- `api/cards-import/handler.test.ts` asserts: after a successful Claude
  response, zero rows exist in the `cards` table.
- Per-slice reviews check that no new endpoint bypasses this.

### 6.4 Password hashes and session tokens never leave their boundary

- Password hashes NEVER appear in API responses, logs, error messages,
  fixtures, or snapshots.
- Session tokens (signed cookies) NEVER appear in logs or error messages.
  Log the `userId` instead.

Enforcement: [`/security-scan`](../../.claude/skills/security-scan/SKILL.md)
greps for bcrypt hash shapes (`$2[aby]\$\d{2}\$`) and HMAC-token shapes in
tracked files.
