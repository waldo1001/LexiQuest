# Per-side card language for TTS (language courses)

## 1. Task

A LexiQuest course pairs **two** languages: the user's UI language and
the studied language (e.g. an English-speaking child studying French).
On a card, one side is typically in the user's language and the other in
the studied language. Today every card has a single `course.language`
and the frontend speaks **both** sides with that one language
([StudySession.jsx:196-197](../../frontend/src/screens/StudySession.jsx#L196-L197),
[CardManager.jsx:210-221](../../frontend/src/screens/CardManager.jsx#L210-L221)),
so one side is always pronounced in the wrong voice.

Fix: detect each side's language **during the Claude extraction call**
(only for language courses, i.e. courses with a non-null `language`),
persist it on the card, and use it per side in the TTS layer.

## 2. Scope boundary

### IN

- Extend `CardRow`, `CardProfile`, `CardCreateBody`, `CardPatchBody`
  with two optional fields
  ([api/src/functions/cards-shared.ts](../../api/src/functions/cards-shared.ts)):
  - `question_lang: string | null`
  - `answer_lang: string | null`
  - Validate with the BCP-47 regex already used in
    [courses-shared.ts:18](../../api/src/functions/courses-shared.ts#L18).
  - Both default to `null` so existing cards behave exactly as today.
- Extend `CardCandidate` and `ExtractCardsInput` in
  [api/src/shared/claude.ts](../../api/src/shared/claude.ts) with the
  same two fields, and update `parseCards` to surface them (missing
  values ⇒ `null`).
- Update the `extractCards` prompt to:
  - State `Course language: <X>` and `User language: <Y>`.
  - Instruct Claude to set `question_lang` and `answer_lang` to
    **exactly one of** `<X>` or `<Y>` for each card, based on the
    actual text on each side.
  - Only request these fields when `course.language !== null`. Non-
    language courses (math, history) skip per-side tagging — both
    fields stay `null`.
- [cards-import.ts](../../api/src/functions/cards-import.ts): pass
  through the per-side languages in the import-review response so the
  user sees them before confirming (Invariant 3 — AI import always
  routes through Import Review).
- [cards-batch.ts](../../api/src/functions/cards-batch.ts) and
  [cards.ts](../../api/src/functions/cards.ts) /
  [cards-id.ts](../../api/src/functions/cards-id.ts): accept and
  persist the two fields on create/patch.
- Frontend TTS pick-per-side:
  - [StudySession.jsx:196-197](../../frontend/src/screens/StudySession.jsx#L196-L197) —
    `tts.speak(card.question, card.question_lang ?? courseLang)` and
    likewise for the answer.
  - [CardManager.jsx:210-221](../../frontend/src/screens/CardManager.jsx#L210-L221) —
    same fallback for the manual speak buttons.
  - `canSpeak` / `autoSpeak` checks availability of the **relevant
    side's** language, not just the course language.
- The `tts` seam ([frontend/src/lib/tts.js](../../frontend/src/lib/tts.js))
  stays unchanged — it already accepts a `lang` argument per call.

### OUT

- No bulk re-extraction or backfill of historical cards. They keep
  `null/null` and fall back to `courseLang` (== current behaviour).
- No new manual-edit UI for these fields. If the user wants to override
  Claude's tagging by hand, that is a follow-up slice.
- No language detection for cards typed in via the manual `POST
  /api/cards` form — both fields stay `null`.
- No change to the `Course.language` model. We do **not** introduce a
  separate `course.user_language` column — the user's language is
  already on the user row (`users.ui_language`).
- No change to MCQ distractor language. Distractors live next to the
  answer and inherit `answer_lang` implicitly; no separate field.

## 3. Files to touch

### api/

- [api/src/functions/cards-shared.ts](../../api/src/functions/cards-shared.ts) —
  add fields, validation, profile mapping.
- [api/src/functions/cards-shared.test.ts](../../api/src/functions/cards-shared.test.ts) —
  validation cases.
- [api/src/shared/claude.ts](../../api/src/shared/claude.ts) — extend
  `CardCandidate`, prompt, `parseCards`.
- [api/src/shared/claude.test.ts](../../api/src/shared/claude.test.ts) —
  parse cases for the two new fields.
- [api/src/functions/cards-import.ts](../../api/src/functions/cards-import.ts) +
  [cards-import.test.ts](../../api/src/functions/cards-import.test.ts) —
  propagate the fields through the import response.
- [api/src/functions/cards-batch.ts](../../api/src/functions/cards-batch.ts) +
  [cards-batch.test.ts](../../api/src/functions/cards-batch.test.ts) —
  persist on batch create.
- [api/src/functions/cards.ts](../../api/src/functions/cards.ts),
  [cards-id.ts](../../api/src/functions/cards-id.ts) and their tests —
  accept on manual create/patch (optional, default `null`).

### frontend/

- [frontend/src/screens/StudySession.jsx](../../frontend/src/screens/StudySession.jsx) +
  [StudySession.test.jsx](../../frontend/src/screens/StudySession.test.jsx).
- [frontend/src/screens/CardManager.jsx](../../frontend/src/screens/CardManager.jsx) +
  [CardManager.test.jsx](../../frontend/src/screens/CardManager.test.jsx).

## 4. Seams and dependencies

- **`ClaudeClient` seam** — already mockable. The fake in
  `frontend`/`api` test fixtures returns `CardCandidate[]`; tests update
  the fixtures to include `question_lang`/`answer_lang`.
- **`tts` seam** — unchanged; already injected via `useTts()` /
  `createTts()`. Tests inject a fake that records `(text, lang)` calls.
- **`TableStorage` seam** — fields are plain strings, no schema
  migration needed (Table Storage is schemaless). Existing rows simply
  lack the columns and are read as `undefined` ⇒ normalised to `null`.

## 5. RED test list

API:

1. `claude.test.ts` — `parseCards` accepts a JSON array where each
   item carries `question_lang` and `answer_lang` and surfaces them on
   the returned `CardCandidate`s.
2. `claude.test.ts` — when those fields are missing from Claude's JSON,
   `parseCards` defaults them to `null` (forward-compat).
3. `cards-shared.test.ts` — `validateCardCreate` / `validateCardPatch`
   accept valid BCP-47 (`fr`, `fr-FR`, `en`, `nl-BE`) on both fields,
   reject garbage (`"french"`, `"FR"`, `42`).
4. `cards-shared.test.ts` — `cardProfile` returns the two fields,
   defaulting to `null` for legacy rows.
5. `cards-import.test.ts` — given a Claude stub that returns per-side
   languages, the import response surfaces them on each candidate.
6. `cards-batch.test.ts` — POSTing a batch with per-side languages
   round-trips through `GET /api/cards`.

Frontend:

7. `StudySession.test.jsx` — when `card.question_lang === "en"` and
   `card.answer_lang === "fr-FR"`, auto-speak calls
   `tts.speak(question, "en")` on `PHASE.QUESTION` and
   `tts.speak(answer, "fr-FR")` on `PHASE.ANSWER`.
8. `StudySession.test.jsx` — when both fields are `null`, both calls
   fall back to `courseLang` (current behaviour preserved).
9. `StudySession.test.jsx` — `autoSpeak` only fires for a side whose
   resolved language is reported available by `tts.isAvailable`.
10. `CardManager.test.jsx` — manual speak buttons use the per-side
    language with fallback to `courseLang`.

## 6. Risks

- **Claude returns a third language.** Mitigated by constraining the
  prompt to `{course.language, user.ui_language}`. If it slips through,
  validation accepts any BCP-47, so the worst case is a voice that the
  browser doesn't have ⇒ `tts.isAvailable` returns false ⇒ silent on
  that side. Acceptable failure mode.
- **Claude omits the fields entirely.** `parseCards` defaults to
  `null`, which falls back to `courseLang` ⇒ identical to today's
  behaviour. No regression.
- **BCP-47 mismatch between course (`fr-FR`) and user
  (`en`).** Browsers match on the language prefix
  ([tts.js:17-18](../../frontend/src/lib/tts.js#L17-L18)), so the exact
  region tag is not load-bearing for voice availability.
- **Tier A coverage on `claude.ts`.** The added prompt branch is in the
  `/* v8 ignore */` block (real Anthropic call). The pure logic
  (`parseCards`, type extension) remains 100% covered.

## 7. Out of scope

- Bulk re-tagging of existing cards via a one-shot Claude pass.
- Manual override UI in CardManager.
- Distractor-level language tagging.
- Splitting `Course.language` into separate `course.user_language` and
  `course.studied_language` fields (the user's language already lives
  on the user row).
- Anything to do with TTS voice **selection** beyond what
  `tts.isAvailable` already does.

## 8. Open questions

1. **Constrain Claude to two languages, or allow free-form?** Plan
   currently constrains to `{course.language, user.ui_language}`.
   Alternative: free-form BCP-47, lets Claude tag the odd loanword
   correctly but risks drift (`fr-CA` vs `fr-FR`). Recommend
   constrained.
2. **Should `null` course language also skip the new prompt fields?**
   Yes — non-language courses don't need per-side tagging, and asking
   Claude for it on a math worksheet would just be noise. Already in
   the plan but flagging explicitly.
