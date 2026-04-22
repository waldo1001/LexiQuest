---
phase: 2
slice: 2
name: PasswordHasher seam
status: proposed
---

# Phase 2 · Slice 2 — `PasswordHasher` seam

## 1. Task

Introduce a `PasswordHasher` seam with a `BcryptPasswordHasher` real
implementation (via `bcryptjs`) and a `FakePasswordHasher` fake.
Share a contract test that runs against both.

## 2. Scope (IN / OUT)

**IN**: interface (`hash(pw)`, `verify(pw, hash)`), real, fake,
contract test. `bcryptjs` + `@types/bcryptjs` added to `api/`.

**OUT**: `POST /api/login` (Phase 3). Session signer (Phase 3). No
hash appears in logs, errors, fixtures — enforced by security-scan.

## 3. Files

- `api/src/shared/password-hasher.ts` — interface
- `api/src/shared/bcrypt-password-hasher.ts` — real (v8-ignored; the
  real bcryptjs library is externally tested and the contract suite
  runs against it, but the class wrapper is a thin delegator whose
  coverage comes from the contract runner)
- `api/testing/fake-password-hasher.ts`
- `api/src/shared/__contract__/password-hasher.contract.ts`
- `api/src/shared/__contract__/password-hasher.bcrypt.test.ts`
- `api/src/shared/__contract__/password-hasher.fake.test.ts`

## 4. Seams

`hasher`.

## 5. RED list

- **AC1**: `verify(pw, hash(pw))` resolves `true`.
  - name: `"verify returns true on matching password + hash"`
- **AC2**: `verify(wrong, hash(pw))` resolves `false`.
  - name: `"verify returns false on wrong password"`
- **AC3**: two successive `hash(pw)` calls return different outputs
  (salted).
  - name: `"hash produces a different output per call (salted)"`
- **AC4**: `hash` output is ≥40 chars (basic shape check; real bcrypt
  is 60 but fake may differ — the assertion is "non-empty and
  non-trivial").
  - name: `"hash output is not empty or obviously plaintext"`

## 6. Assumptions

- `bcryptjs` (not native `bcrypt`) so the api runs on serverless
  environments without native-addon build step.
- Cost factor 10 for speed/security balance in family-scale usage —
  tests use cost 4 via DI to keep the suite fast.

## 7. Risks

- bcryptjs is slow; setting cost=4 in tests keeps suite <5s.

## 8. Out-of-scope

- Slice 3: `Clock`, `Random`, `Logger` seams.
- Slice 4: `scripts/seed.ts`.
- Phase 3: login endpoint.
