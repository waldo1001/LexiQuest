---
phase: 2
slice: 1
name: TableStorage seam
status: proposed
---

# Phase 2 · Slice 1 — `TableStorage` seam

## 1. Task

Introduce the `TableStorage` interface, a `FakeTableStorage` in
`api/testing/`, and a real `AzureTableStorage` implementation backed
by `@azure/data-tables`. Share a single contract test suite against
both. Establish the JSON-field-serialization helper pair used by both.

## 2. Scope boundary

**IN**

- `api/src/shared/table-storage.ts` — `TableStorage` interface + the
  `TableName` type + `Entity` type, copied from the example and
  narrowed to LexiQuest's six tables.
- `api/src/shared/azure-table-storage.ts` — real implementation using
  `@azure/data-tables`, constructed from a single storage connection
  string. Handles JSON-field (de)serialization via a declared map of
  table → json-field-names.
- `api/testing/fake-table-storage.ts` — in-memory Map-backed fake
  (per example). Test-only introspection method `size()`.
- `api/src/shared/__contract__/table-storage.contract.ts` — shared
  assertion suite (NOT a `.test.ts`; it's a factory called by two
  runners).
- `api/src/shared/__contract__/fake.test.ts` — runs the contract
  against `FakeTableStorage`.
- `api/src/shared/azure-table-storage.test.ts` — unit tests on the
  JSON-serialization helpers only (pure logic, no network).
- Contract-against-Azurite runner is deferred (Slice 5) — requires
  Azurite to actually be running.
- Add `@azure/data-tables` + `uuid` to `api/dependencies`.

**OUT**

- Azurite contract runner → Phase 2 Slice 5 (Azurite smoke).
- `upsert` behavior for partitioning strategy quirks beyond the six
  documented tables → out of scope; the six tables in Design.md §3.3
  cover it.
- `bcryptjs` / `PasswordHasher` → Phase 2 Slice 2.
- Seed script → Phase 2 Slice 4.

## 3. Files to create / touch

- `api/src/shared/table-storage.ts` (new)
- `api/src/shared/azure-table-storage.ts` (new)
- `api/src/shared/azure-table-storage.test.ts` (new)
- `api/testing/fake-table-storage.ts` (new)
- `api/src/shared/__contract__/table-storage.contract.ts` (new)
- `api/src/shared/__contract__/fake.test.ts` (new)
- `api/package.json` — add `@azure/data-tables`.

## 4. Seams involved

`tables` — this slice defines it.

## 5. RED list

Contract assertions (run against both Fake and later Azurite):

- **AC1**: `getById` returns `null` when the row doesn't exist.
  - test name: `"getById returns null for missing rows"`
- **AC2**: `upsert` then `getById` returns the same entity.
  - test name: `"upsert persists an entity retrievable by partitionKey + rowKey"`
- **AC3**: `upsert` twice with same keys replaces the entity.
  - test name: `"upsert replaces on same partitionKey + rowKey"`
- **AC4**: `listByPartition` returns all rows in that partition.
  - test name: `"listByPartition returns all rows under the partitionKey"`
- **AC5**: `listByPartition` returns empty when nothing is there.
  - test name: `"listByPartition returns [] for an empty partition"`
- **AC6**: `listByRowKeyRange` filters inclusive of both bounds, sorted.
  - test name: `"listByRowKeyRange filters inclusive on both bounds and returns sorted"`
- **AC7**: `remove` deletes; subsequent `getById` returns `null`.
  - test name: `"remove deletes an existing row"`
- **AC8**: `remove` is a no-op for missing rows.
  - test name: `"remove is a no-op for rows that don't exist"`

Azure-specific JSON helper tests (unit-only):

- **AC9**: `serializeJsonFields` turns declared fields into JSON strings.
- **AC10**: `deserializeJsonFields` turns them back into JS values.
- **AC11**: Round-trip on a `users` entity with `settings: { auto_speak: true }` is lossless.
- **AC12**: Non-declared fields are left untouched.

## 6. Assumptions

- Row-key format `{isoTimestamp}_{uuid}` guaranteed by upstream call
  sites (not enforced by the seam). Meta-test for this format is
  Phase 9 Slice 1.
- `@azure/data-tables` latest major (v13) is API-compatible with
  Node 20.

## 7. Risks

- ESM module-resolution for `@azure/data-tables` inside Node 20
  strict mode. Mitigation: rely on `"moduleResolution": "NodeNext"`
  in tsconfig which already handles it.
- Contract test's fake runs fast; the Azurite runner will be Phase 2
  Slice 5.

## 8. Out-of-scope follow-ups

- Slice 2 (`PasswordHasher` seam).
- Slice 3 (`Clock`, `Random`, `Logger` seams).
- Slice 4 (`scripts/seed.ts`).
- Slice 5 (Azurite contract runner + smoke).
