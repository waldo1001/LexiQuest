# Plan — Image avatar for Waldo (and any future admin)

## Context

User picker today shows each user as `{avatar_emoji} {name}` — Waldo
gets 🦊, Lex 🐯, Mats 🐻, Ben 🐼, Kaat 🐰, Amaryllis 🌸. The
[UserRow](../../api/src/shared/seed.ts:6) schema has
`avatar_emoji: string` only — single grapheme.

After [pwa-online-only.md](pwa-online-only.md) ships, the user wants
Waldo's avatar to be his personal "waldo" mark
([scripts/icon-source/waldo.png](../../frontend/scripts/icon-source/waldo.png) —
same source the PWA icons are rendered from). Visually consistent with
the home-screen icon, and the parent/admin clearly distinguishable
from the kids.

This is a v1 schema change: add an **optional** `avatar_image_url`
field. When set, the frontend renders `<img>` instead of the emoji
character. Existing rows with no `avatar_image_url` fall back to
`avatar_emoji` — no data migration required for existing users.

**Depends on**: [pwa-online-only.md](pwa-online-only.md) — the file
this references (`/icons/icon-192.png`) is created there. Don't merge
this slice before the PWA slice.

## Task (one sentence)

Add an optional `avatar_image_url` to `UserRow` and to the
`/api/users/public` projection, render it as `<img>` in the user
picker (with emoji fallback), and seed Waldo's spec with
`/icons/icon-192.png`.

## Scope — IN

1. **Schema** ([api/src/shared/seed.ts](../../api/src/shared/seed.ts:6))
   — add `avatar_image_url?: string` to `UserRow` and to
   `SeedUserSpec`. Set Waldo's spec entry to
   `avatar_image_url: "/icons/icon-192.png"`. Other users keep emoji
   only.
2. **Seed copy** ([api/src/shared/seed.ts:99](../../api/src/shared/seed.ts:99))
   — when creating a new user row, copy the spec's
   `avatar_image_url` if present. Existing-row branch is unchanged
   (idempotent — does not retroactively populate Waldo's existing row).
3. **Public picker projection**
   ([api/src/functions/users-public.ts:18](../../api/src/functions/users-public.ts:18))
   — include `avatar_image_url: r.avatar_image_url ?? null` in the
   response.
4. **Login + /me responses**
   ([login.ts:72](../../api/src/functions/login.ts:72),
   [me.ts](../../api/src/functions/me.ts)) — include the field so the
   header/profile views can show the same avatar.
5. **Validation + admin update**
   ([api/src/functions/users-shared.ts](../../api/src/functions/users-shared.ts),
   [users-id.ts](../../api/src/functions/users-id.ts),
   [users.ts](../../api/src/functions/users.ts)) — `validateUserPatch`
   accepts an optional string; reject anything that doesn't start with
   `/icons/` (whitelist v1 — no external URLs, no SVGs, no
   query strings; closes XSS / privacy / CORS holes). PUT and POST
   handlers preserve / set the field.
6. **Frontend rendering**
   ([frontend/src/screens/UserPicker.jsx](../../frontend/src/screens/UserPicker.jsx))
   — if `avatar_image_url` is a non-empty string, render
   `<img src={avatar_image_url} alt="" width=… height=…
   className="user-avatar-img">`; otherwise the existing emoji span.
   Same swap in any other place that renders an avatar (header,
   leaderboard, results screens, admin user list).
7. **CSS** — sized to match the emoji visual footprint (probably
   `1em × 1em` or `48 × 48` matching whatever the picker uses today).
   Round corners (border-radius: 50%) for visual consistency with
   maskable home-icon style.
8. **Migration of the existing Waldo row** — done **manually after
   the slice ships**: log in as Waldo (after running the
   reset-password script from the previous slice) and use the admin
   "edit user" UI to set the image URL. No migration script needed.
   Documented in the slice's verification steps.

## Scope — OUT

- **Custom uploads**: kids can't upload a photo. Whitelisted
  paths only. Adding upload would require Blob Storage, presigned
  URLs, image moderation — separate phase.
- **Per-kid images**: only Waldo gets a custom image in this slice.
  The 🐯/🐻/🐼/🐰/🌸 emoji avatars stand for Lex/Mats/Ben/Kaat/Amaryllis.
- **Replacing the emoji field**: `avatar_emoji` stays. It's the
  fallback and what kids see when they edit profile (emoji picker is
  a fun affordance — keeping it).
- **Animated avatars** (GIF, Lottie, video). Static PNG only.
- **Theming the avatar based on `color`** (e.g. tinted ring). Visual
  polish, not functional.
- **A11y avatar descriptions** — `alt=""` because the name is shown
  next to the image; the avatar is decorative. If we ever ship
  avatar-only contexts, add proper alt text then.

## Files to touch

| File | Change |
|---|---|
| [api/src/shared/seed.ts](../../api/src/shared/seed.ts) | Add field to `UserRow` + `SeedUserSpec`; set Waldo's spec; copy in `seed()` |
| [api/src/shared/seed.test.ts](../../api/src/shared/seed.test.ts) | Add 2 tests: Waldo spec carries url; new rows persist it |
| [api/src/functions/users-public.ts](../../api/src/functions/users-public.ts) | Project `avatar_image_url` in the response |
| [api/src/functions/users-public.test.ts](../../api/src/functions/users-public.test.ts) | Assert field present (null for non-Waldo, string for Waldo) |
| [api/src/functions/users-shared.ts](../../api/src/functions/users-shared.ts) | Add to `fullProfile`; validate in `validateUserPatch` |
| [api/src/functions/users-shared.test.ts](../../api/src/functions/users-shared.test.ts) | Validation tests: accept `/icons/foo.png`; reject `https://…`, `javascript:…`, empty, non-png |
| [api/src/functions/users-id.ts](../../api/src/functions/users-id.ts) | Preserve + apply patch field |
| [api/src/functions/users-id.test.ts](../../api/src/functions/users-id.test.ts) | PUT updates the field; persists on round-trip |
| [api/src/functions/users.ts](../../api/src/functions/users.ts) | POST accepts the field on create |
| [api/src/functions/login.ts](../../api/src/functions/login.ts) | Include in login response body |
| [api/src/functions/me.ts](../../api/src/functions/me.ts) | Include in `/me` response |
| [frontend/src/screens/UserPicker.jsx](../../frontend/src/screens/UserPicker.jsx) | Render `<img>` when `avatar_image_url` present |
| Other avatar render sites (grep for `avatar_emoji`) | Same conditional swap |
| `frontend/src/components/Avatar.jsx` (NEW) | Single component encapsulating "image-or-emoji" so the rule lives in one place |
| `frontend/src/components/Avatar.test.jsx` | RED tests for the component |
| Frontend CSS (whichever module owns avatars) | `.avatar-img { width: 1em; height: 1em; border-radius: 50%; object-fit: cover; }` |

A new `Avatar` component is worth the 30 lines because the
image-or-emoji decision will otherwise be duplicated across UserPicker,
header, leaderboard, and results screens — and the duplication is
exactly the kind of bug-magnet that gets one site updated and the others
forgotten.

## RED test list

### `api/src/shared/seed.test.ts` (Tier A, 90%)

- **AVATAR-1**: `SEED_USERS` Waldo entry has
  `avatar_image_url: "/icons/icon-192.png"`.
- **AVATAR-2**: after `seed()`, Waldo's stored row has the
  `avatar_image_url` set.
- **AVATAR-3**: after `seed()`, Lex/Mats/Ben/Kaat/Amaryllis rows do
  *not* have `avatar_image_url` (i.e. the field is `undefined` on
  those rows).

### `api/src/functions/users-public.test.ts`

- **AVATAR-4**: `/api/users/public` response includes
  `avatar_image_url: "/icons/icon-192.png"` for Waldo.
- **AVATAR-5**: same response has `avatar_image_url: null` for users
  whose row lacks the field.

### `api/src/functions/users-shared.test.ts`

- **AVATAR-6**: `validateUserPatch` accepts `/icons/icon-192.png`.
- **AVATAR-7**: `validateUserPatch` rejects `https://example.com/x.png`
  (no external URLs).
- **AVATAR-8**: `validateUserPatch` rejects `javascript:alert(1)`
  (XSS-shaped string).
- **AVATAR-9**: `validateUserPatch` rejects `/icons/../../etc/passwd`
  (path-traversal shape — must match an allow-list pattern, not just
  prefix).
- **AVATAR-10**: `validateUserPatch` accepts an empty / null value
  for clearing the field.

### `api/src/functions/users-id.test.ts`

- **AVATAR-11**: PUT with `avatar_image_url` updates and persists on
  GET.

### Frontend `frontend/src/components/Avatar.test.jsx` (Tier B, 70%)

- **AVATAR-12**: renders `<img>` with the URL when
  `avatar_image_url` is set.
- **AVATAR-13**: renders the emoji span when only `avatar_emoji` is
  set.
- **AVATAR-14**: renders the emoji span when both are set but
  `avatar_image_url` is empty string.
- **AVATAR-15**: when only `avatar_emoji` is set, no `<img>` request
  fires (network probe via fetch spy / DOM query).

### `frontend/src/screens/UserPicker.test.jsx`

- **AVATAR-16**: Waldo tile renders an `<img>` with
  `src="/icons/icon-192.png"`; Lex tile renders the 🐯 span.

## Verification

1. **Tests** — `cd api && npm test` and `cd frontend && npm test`
   green; new tests visible.
2. **Typecheck** — `cd api && npm run typecheck` clean.
3. **Local-smoke** — open
   [http://localhost:4280](http://localhost:4280) (or whatever the
   smoke skill chooses), confirm Waldo's tile shows the waldo mark
   image and other tiles still show emoji.
4. **Migrate the existing Waldo row in Azurite** — after the slice
   builds, log in as Waldo (using a password set by
   `npm run reset-password`), open the admin user-edit UI, and set
   Waldo's avatar URL to `/icons/icon-192.png`. Save. Verify the
   header/leaderboard now also show the image.
   Alternative one-liner if no UI exists yet:
   ```
   curl -X PUT http://localhost:4280/api/users/<waldoId> \
     -H 'Cookie: lexiquest=…' \
     -H 'Content-Type: application/json' \
     -d '{"avatar_image_url":"/icons/icon-192.png"}'
   ```
5. **PWA cross-check** — install the PWA on Android per
   [pwa-online-only.md](pwa-online-only.md) verification, then open
   the picker. Home-screen icon and Waldo's avatar should be visually
   identical (same source PNG).
6. **Security scan** — `/security-scan`, paying attention to the new
   validation: confirm no path-traversal or external-URL acceptance
   slipped through, no `dangerouslySetInnerHTML` in the new component.
7. **Docs** — `/docs-update` to mention the avatar-image option in
   [docs/user-guide.md](../../docs/user-guide.md) (one line: "admins
   can set a custom avatar URL under `/icons/`").

## Risks / notes

- **XSS via image URL**: an attacker could set
  `avatar_image_url = "javascript:alert(1)"` if validation is sloppy.
  We avoid this by **only allowing strings that match the regex
  `^/icons/[a-z0-9-]+\.(png|webp)$`**. No querystring, no path
  segments, no SVG (SVG can carry script). Tests AVATAR-7..9 lock
  this down.
- **Path traversal**: similarly, the regex blocks `..` and slashes
  past the first one. Don't be tempted to "just check it starts with
  `/icons/`".
- **Cache busting after icon change**: if the icon-source PNG is
  rotated, the file path stays `/icons/icon-192.png` and browsers
  may serve stale. The PWA's service worker takes care of revving
  hashed asset filenames for built JS/CSS, but `public/` files are
  served as-is. Mitigation: bump filename (e.g. `icon-192.v2.png`)
  whenever the source changes — out of scope for this slice; mention
  in user-guide.
- **Picker layout shift**: if the image takes longer to load than
  the emoji renders, the tile can jump. Reserve space with
  `width`/`height` attributes on the `<img>` so layout is stable
  even before pixels arrive.
- **Avatar component sprawl**: there's a mild risk the conditional
  spreads if I forget a render site. Mitigation: do a final
  `grep -rn "avatar_emoji" frontend/src/` and confirm every match
  goes through the new `Avatar` component.
- **Schema additivity**: adding an optional field is backward
  compatible at the API level. No client lockstep deploy needed; old
  clients will simply ignore the new field. Worth a one-line note in
  the changelog.
