# User guide — LexiQuest

For family members using the running app.

Current state: **Phase 18 complete — bidirectional cards.** This guide fills in from Phase 3
onward (first login + dashboard) and gets sections added per phase:

- **Logging in** (Phase 3): tap your avatar, enter password, you land on
  your dashboard.
- **Settings** (Phase 4): click the "Settings" link on the Home screen.
  Pick your UI language (English or Dutch). The change takes effect
  immediately and is remembered across sessions.
- **Themes** (post-Phase 17): Settings → Theme. Three options:
  - *Classic* — clean purple on near-white (grown-up).
  - *Playful* — coral + Nunito font, rounded everything (default for new users; kid-friendly).
  - *Arcade* — dark navy with neon cyan accents, JetBrains Mono headings (always dark).
  The theme is saved per-user, so each family member can pick their own.
- **Courses** (Phase 6): from the Home screen, click "My courses" to see
  your courses for the current school year. Click "New course" to create
  one — give it a name, emoji, color, optional language (e.g. `fr-FR` for
  French pronunciation), and a default study mode. Click the edit icon on
  any course card to rename or change settings; click delete (with
  confirmation) to remove it and all its cards. Admins can manage school
  years from the Admin Panel (School years section: create, rename, and
  mark a year as current).
- **Adding cards** (Phase 7): from the Courses screen click "Manage cards"
  next to any of your courses (or any course you want to browse). You land
  on the Card Manager. If you own the course (or are an admin), you'll see
  "New card" and Edit / Delete buttons on every row; otherwise the table is
  read-only. Add a card: enter the Question, the Answer (use `|` to list
  alternatives, e.g. `le chien|le chiot`), and an optional Hint. New cards
  get SM-2 defaults (`ease=2.5, interval=0, reps=0`) and are immediately
  due. Edit a card inline by clicking "Edit" and Save. Delete with
  confirmation. You can browse any family member's cards — a great way to
  see what Lex is studying in French.
- **Bulk-deleting cards**: cards in the Card Manager are grouped by
  upload — every photo or AI import becomes its own group with a
  timestamp label like `Upload — 2026-04-25 14:02 (12 cards)`; manually
  added cards live under "Manual cards". Each upload group has a "Delete
  this upload" button so a wrong import can be wiped in one click. A
  toolbar above the groups offers two more options: select rows via the
  per-row checkbox and use "Delete selected (N)", or use "Delete all
  cards" to clear the whole course (both confirm with the count). All
  bulk deletions are scoped to the course you're viewing.
- **Studying** (Phase 8): from the Courses screen click "Study" next to any
  course. LexiQuest builds a queue of cards that are due today (their
  scheduled review date has passed) plus up to 20 new cards you haven't seen
  yet. For each card:
  1. Read the **question**.
  2. Click **Show answer** to reveal the answer.
  3. Tap **Knew it** (correct) or **Didn't know** (wrong).
  Wrong cards go into a retry pile and appear again at the end of the session.
  When all cards (including retries) are done, the session is saved
  automatically — SM-2 scheduling on every card updates so the next due date
  reflects how well you knew it. Correct cards on the first attempt are
  counted toward your daily goal (Phase 10). MCQ mode (Phase 13) adds once
  cards have distractors.
- **Photo import** (Phase 12): from the Card Manager, click "Import cards
  from photo". Choose a photo of a vocab sheet (or take one with the
  camera). If your course has a language set, two dropdowns appear:
  **Question language** and **Answer language** — pick the language of
  each side so the 🔊 buttons speak the right voice later. Defaults:
  question = course language, answer = your UI language. For single-
  language content (e.g. history notes in French), set both to the same
  language. Click "Extract cards" — Claude reads the photo and returns a
  list of question/answer/distractor candidates (this takes 5–15 seconds).
  On the Review screen, every extracted card is shown with a checkbox
  (all ticked by default). Untick cards you don't want, edit any field
  inline, then click "Save selected". Only the ticked cards are saved to
  your course — extraction results are never auto-saved. If Claude can't
  read the photo (blank page, bad lighting), a friendly error message is
  shown instead of a crash.
- **Stats** (Phase 15): three stats screens, all accessible to every family
  member:
  - **Family Dashboard** (`/family`): one-page overview of all users. Each
    person gets a card showing their avatar, current streak, XP, and
    accuracy. Below the cards: XP over time and accuracy trend charts for
    all users overlaid. Use the range selector (7d / 30d / 90d / 1y / All)
    to zoom in or out. Click any user card to open their personal stats.
  - **User Stats** (`/stats/user/:userId`): deep dive for one person.
    Header shows name, level, total XP, and current streak. Tabs:
    - *Overview* — activity heatmap (GitHub-contrib style, last 52 weeks),
      XP over time, accuracy trend, hour-of-day histogram (when they study),
      response-time distribution.
    - *Per Course* — list of courses (click through to Course Stats).
    - *Badges* — all earned badges listed.
    Use the range selector to filter all charts to a time window.
  - **Course Stats** (`/stats/course/:courseId`): per-course drill-down.
    Mastery distribution (new / learning / young / mature / mastered bar
    chart), sessions over time, and the card struggle list — the top 20
    cards ranked by fail count. This tells you which cards to spend extra
    time on.
- **Leaderboard** (Phase 16): XP ranking for the whole family.
  - Go to `/leaderboard`. Choose a period: 7 days, 30 days, or All time.
    The list shows everyone ranked by XP, with their avatar, name, and XP
    total. Click any entry to open that person's User Stats.
  - Three secondary award cards at the top: 🎯 Most accurate (highest
    correct-first-try rate), 🔥 Longest streak (most consecutive study
    days), 💪 Most sessions (most study sessions in the selected period).
- **Compare** (Phase 16): overlay any combination of users on one chart.
  - Go to `/compare`. All family members are selected by default (shown as
    colored chips). Click a chip to toggle that person on or off. Choose a
    metric from the dropdown: XP, Accuracy, Sessions, Cards, or Minutes.
    Pick a date range. The chart updates instantly showing all selected
    users overlaid with their own color.
- **Install as an app** (Phase 17): add to home screen on iOS or Android.
  Works full-screen without browser chrome.
- **Settings** (Phase 17): UI language (NL / EN), auto-speak, daily goal,
  preferred study mode, streak freeze tokens, and:
  - **Display theme** — System default, Light, or Dark.
  - **Export my data** — downloads `lexiquest-{name}-{date}.json` containing
    all your courses, cards, sessions, and attempts.
- **Per-side TTS pronunciation** (post-v1): when you import cards via
  photo into a language course, Claude now tags each side with its
  language (e.g. question = French, answer = Dutch). The 🔊 buttons
  and auto-speak use the correct voice for each side instead of speaking
  everything in the course language. You can also set **default per-side
  languages on the course itself** (edit the course → Question language /
  Answer language dropdowns). These defaults act as a safety net: any
  card without explicit per-side tags inherits the course defaults. For
  example, set "Frans" to question=fr, answer=nl and all cards — old
  imports, manual additions, and new imports — get the right TTS voice
  automatically.
- **Bidirectional cards** (Phase 18): when you create or edit a course,
  tick "Cards study both directions" to make it bidirectional. Every card
  you add (manually, via photo import, or AI) will automatically get a
  reverse companion — if the forward card is "the dog → le chien", the
  reverse becomes "le chien → the dog". Each direction has its own SM-2
  schedule so you learn both ways independently. In the Card Manager,
  paired cards show a ↔ badge next to the question; hover it to see which
  card it's paired with. When you delete a paired card, a second prompt
  asks whether to also delete the partner — say yes to remove both, no to
  remove only the one you chose. You can also use "Add reverse cards" in
  the Card Manager toolbar to retroactively create reverses for all
  existing cards in a course (idempotent — already-reversed cards are
  skipped). During photo import, a "Also create reverse cards" checkbox
  (on by default for language courses) lets you opt in or out per batch.
- **Studying with swipe** (Phase 17): on touch screens you can swipe the
  card instead of tapping buttons — swipe right to mark "Knew it", swipe
  left for "Didn't know". Only active when the answer is shown.
- **Bottom navigation** (Phase 17): fixed bottom bar links to Dashboard,
  Study (Home), Family Dashboard, and Settings on all screens.
- **Offline** (Phase 17): if the device goes offline a banner appears at
  the bottom of the screen. The app shell remains usable but API calls
  will fail until connectivity is restored.

Each phase's `/docs-update` run fills out the relevant section here.
