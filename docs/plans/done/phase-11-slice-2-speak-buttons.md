# Plan — Phase 11 Slice 2: 🔊 buttons in StudySession + CardManager

## Task
Add speak buttons to the study card view and card manager so users can hear
question/answer pronunciation for language courses.

## Scope boundary
**In**: CourseList passes `courseLang`, StudySession shows 🔊 next to question
(and answer after reveal), CardManager shows 🔊 per card row.
**Out**: `auto_speak` toggle (Slice 3), Settings changes.

## Files to touch
- `frontend/src/screens/CourseList.jsx` — add `courseLang` to Link state
- `frontend/src/screens/StudySession.jsx` — useTts + 🔊 buttons
- `frontend/src/screens/StudySession.test.jsx` — TTS tests
- `frontend/src/screens/CardManager.jsx` — useTts + 🔊 buttons
- `frontend/src/screens/CardManager.test.jsx` — TTS tests
- `frontend/src/i18n/strings.js` — aria-label strings
- `frontend/src/screens/CourseList.test.jsx` — verify courseLang in Link state

## RED test list
- AC1: StudySession shows 🔊 on question when courseLang set + tts available
- AC2: StudySession hides 🔊 when no courseLang
- AC3: StudySession hides 🔊 when tts.isAvailable returns false
- AC4: clicking 🔊 on question calls tts.speak(question, courseLang)
- AC5: after reveal, 🔊 also shown next to answer
- AC6: clicking 🔊 on answer calls tts.speak(answer, courseLang)
- AC7: CardManager shows 🔊 buttons when courseLang set + tts available
- AC8: CardManager hides 🔊 when no courseLang
- AC9: clicking 🔊 in CardManager calls tts.speak(card.answer, courseLang)
