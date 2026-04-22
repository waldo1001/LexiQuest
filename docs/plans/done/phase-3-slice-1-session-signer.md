---
phase: 3
slice: 1
name: SessionSigner seam
status: proposed
---

# Phase 3 · Slice 1 — `SessionSigner` seam

## 1. Task

HMAC-SHA256 signer/verifier for session cookies. Payload
`{ userId, isAdmin, expMs }`. Tokens are URL-safe base64 of
`<json>.<hmac>`. Wrong secret, tampered payload, or expired token →
`verify` returns `null`.

## 2. Scope (IN / OUT)

**IN**: interface, `HmacSessionSigner` real (node `crypto`), fake
that's drop-in compatible (shares the same serialization; just uses
a predictable secret). Contract suite.

**OUT**: cookie setting / parsing (Phase 3 Slice 2 login endpoint).
`requireAuth` middleware (Slice 3).

## 3. Files

- `api/src/shared/session-signer.ts` (interface + real)
- `api/testing/fake-session-signer.ts`
- `api/src/shared/__contract__/session-signer.contract.ts`
- `api/src/shared/__contract__/session-signer.real.test.ts`
- `api/src/shared/__contract__/session-signer.fake.test.ts`

## 4. Seams

`signer` + `clock` (for exp checks).

## 5. RED list

- **S1**: `verify(sign(p))` returns the payload.
- **S2**: tampering with the token returns `null`.
- **S3**: wrong secret returns `null`.
- **S4**: expired token returns `null` (uses injected clock).
- **S5**: malformed token returns `null`.

## 6. Assumptions

- Token format `<base64url(json)>.<base64url(hmac)>`. Using node's
  `crypto.createHmac('sha256', secret)`.
- `timingSafeEqual` used for HMAC comparison.

## 7. Risks

- Leaking the secret in error messages is blocked by the Logger
  type-level ban; signer throws no error objects that embed the
  secret.

## 8. Out-of-scope

- Cookie flags — Phase 3 Slice 2.
