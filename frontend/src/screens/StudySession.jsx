import { useEffect, useReducer, useCallback, useRef, useState, useMemo } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import {
  startSession as startSessionApi,
  postAttempts as postAttemptsApi,
  closeSession as closeSessionApi,
} from "../lib/api.js";
import { useT } from "../i18n/useT.js";
import { useTts, useAppContext } from "../context/AppContext.jsx";

/**
 * @typedef {{ id: string, question: string, answer: string, distractors?: string[] }} Card
 * @typedef {{ cardId: string, correct: boolean, mode: string, response_time_ms: number }} AttemptItem
 *
 * State machine:
 *   loading → empty | active
 *   active (self_grade): show question → show answer → grade → next card | retry pile
 *   active (mcq): show question + choices → grade on click → next card | retry pile
 *   all done → finishing → navigate to results
 */

/**
 * Resolve whether a card should use MCQ or self_grade for this session mode.
 * @param {Card} card
 * @param {string} sessionMode
 * @returns {"mcq"|"self_grade"}
 */
function resolveCardMode(card, sessionMode) {
  if (sessionMode === "self_grade") return "self_grade";
  const hasDistractors = Array.isArray(card.distractors) && card.distractors.length >= 2;
  return hasDistractors ? "mcq" : "self_grade";
}

function defaultShuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

const PHASE = {
  LOADING: "loading",
  EMPTY: "empty",
  QUESTION: "question",
  ANSWER: "answer",
  MCQ_REVEAL: "mcq_reveal",
  FINISHING: "finishing",
  ERROR: "error",
};

function init() {
  return {
    phase: PHASE.LOADING,
    sessionId: null,
    queue: [],          // remaining cards to show
    retryPile: [],      // wrong cards to show after queue drains
    cardIndex: 0,       // position in queue
    totalUnique: 0,     // total unique cards in the session
    firstTryResults: {}, // cardId → boolean (first-try outcome)
    pendingAttempts: [],  // AttemptItem[]
    startedAt: null,
    error: null,
    gameType: "classic",
    mcqPicked: null,   // the choice the user tapped
    mcqCorrect: null,  // whether it was right
  };
}

function reducer(state, action) {
  switch (action.type) {
    case "LOADED": {
      if (action.cards.length === 0) {
        return { ...state, phase: PHASE.EMPTY };
      }
      return {
        ...state,
        phase: PHASE.QUESTION,
        sessionId: action.sessionId,
        queue: action.cards,
        retryPile: [],
        cardIndex: 0,
        totalUnique: action.cards.length,
        firstTryResults: {},
        pendingAttempts: [],
        startedAt: Date.now(),
        gameType: action.gameType ?? "classic",
      };
    }
    case "SHOW_ANSWER":
      return { ...state, phase: PHASE.ANSWER };
    case "MCQ_PICK":
      return { ...state, phase: PHASE.MCQ_REVEAL, mcqPicked: action.picked, mcqCorrect: action.correct };
    case "GRADE": {
      const { correct, responseTimeMs, cardMode = "self_grade", forceFinish = false } = action;
      const card = state.queue[state.cardIndex];
      const cardId = card.id;
      const attempt = { cardId, correct, mode: cardMode, response_time_ms: responseTimeMs };
      const newAttempts = [...state.pendingAttempts, attempt];

      const isFirstTry = !(cardId in state.firstTryResults);
      const newFirstTry = isFirstTry
        ? { ...state.firstTryResults, [cardId]: correct }
        : state.firstTryResults;

      // Speed round: no retry pile; forceFinish ends immediately
      const skipRetry = state.gameType === "speed_round";
      const newRetry = !correct && !skipRetry ? [...state.retryPile, card] : state.retryPile;

      if (forceFinish) {
        return { ...state, phase: PHASE.FINISHING, pendingAttempts: newAttempts, firstTryResults: newFirstTry };
      }

      const nextIndex = state.cardIndex + 1;

      if (nextIndex < state.queue.length) {
        return {
          ...state,
          phase: PHASE.QUESTION,
          cardIndex: nextIndex,
          retryPile: newRetry,
          firstTryResults: newFirstTry,
          pendingAttempts: newAttempts,
        };
      }

      // Queue drained — move retry pile into queue (not for speed round)
      if (newRetry.length > 0) {
        return {
          ...state,
          phase: PHASE.QUESTION,
          queue: newRetry,
          retryPile: [],
          cardIndex: 0,
          firstTryResults: newFirstTry,
          pendingAttempts: newAttempts,
        };
      }

      return { ...state, phase: PHASE.FINISHING, pendingAttempts: newAttempts, firstTryResults: newFirstTry };
    }
    case "END_EARLY":
      return { ...state, phase: PHASE.FINISHING };
    case "ERROR":
      return { ...state, phase: PHASE.ERROR, error: action.error };
    default:
      return state;
  }
}

/**
 * @param {{
 *   startSession?: typeof startSessionApi,
 *   postAttempts?: typeof postAttemptsApi,
 *   closeSession?: typeof closeSessionApi,
 *   shuffleFn?: (arr: string[]) => string[],
 * }} props
 */
export default function StudySession({
  startSession = startSessionApi,
  postAttempts = postAttemptsApi,
  closeSession = closeSessionApi,
  shuffleFn = defaultShuffle,
}) {
  const t = useT();
  const tts = useTts();
  const { user } = useAppContext();
  const { courseId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { courseName = "", mode = "self_grade", courseLang = null, questionLangDefault = null, answerLangDefault = null, gameType = "classic", cardLimit = null, uploadId = null } = location.state ?? {};
  const isSpeedRound = gameType === "speed_round";
  const ttsAvailable = Boolean(courseLang && tts.isAvailable(courseLang));

  const [state, dispatch] = useReducer(reducer, undefined, init);
  const [speechOn, setSpeechOn] = useState(true);
  const canSpeak = ttsAvailable && speechOn;
  const autoSpeak = canSpeak && Boolean(user?.settings?.auto_speak);

  const FONT_SIZE_MAP = { normal: "1rem", large: "1.4rem", xlarge: "1.9rem" };
  const cardFontSize = FONT_SIZE_MAP[user?.settings?.study_font_size] ?? "1rem";

  // Speed round timer
  const [timeRemaining, setTimeRemaining] = useState(60);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!isSpeedRound || state.phase === PHASE.LOADING || state.phase === PHASE.EMPTY || state.phase === PHASE.ERROR || state.phase === PHASE.FINISHING) {
      return;
    }
    const start = Date.now();
    const initialTime = 60;
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - start) / 1000);
      const remaining = Math.max(0, initialTime - elapsed);
      setTimeRemaining(remaining);
      if (remaining <= 0) {
        clearInterval(timerRef.current);
      }
    }, 250);
    return () => clearInterval(timerRef.current);
  }, [isSpeedRound, state.phase]);

  // Auto-finish when speed round timer expires
  useEffect(() => {
    if (isSpeedRound && timeRemaining <= 0 && state.phase !== PHASE.FINISHING && state.phase !== PHASE.LOADING && state.phase !== PHASE.EMPTY && state.phase !== PHASE.ERROR) {
      dispatch({ type: "GRADE", correct: false, responseTimeMs: 0, cardMode: "self_grade", forceFinish: true });
    }
  }, [isSpeedRound, timeRemaining, state.phase]);

  // Load session on mount
  useEffect(() => {
    let cancelled = false;
    const body = { courseId, mode };
    if (gameType !== "classic") body.gameType = gameType;
    if (cardLimit !== null) body.cardLimit = cardLimit;
    if (uploadId) body.uploadId = uploadId;
    startSession(body)
      .then((data) => {
        if (!cancelled) dispatch({ type: "LOADED", sessionId: data.sessionId, cards: data.cards, gameType });
      })
      .catch((err) => {
        if (!cancelled) dispatch({ type: "ERROR", error: String(err) });
      });
    return () => { cancelled = true; };
  }, [courseId, mode, gameType, cardLimit, startSession]);

  // Ref mirrors the latest state so the unmount/pagehide cleanup can read it.
  const flushRef = useRef({ sessionId: null, pendingAttempts: [], firstTryResults: {}, saved: false });
  flushRef.current.sessionId = state.sessionId;
  flushRef.current.pendingAttempts = state.pendingAttempts;
  flushRef.current.firstTryResults = state.firstTryResults;

  // Finish session when phase transitions to FINISHING
  const finishSession = useCallback(async () => {
    if (state.phase !== PHASE.FINISHING) return;
    if (flushRef.current.saved) return;
    flushRef.current.saved = true;
    try {
      const cardsStudied = Object.keys(state.firstTryResults).length;
      const cardsCorrect = Object.values(state.firstTryResults).filter(Boolean).length;
      if (state.pendingAttempts.length > 0) {
        await postAttempts({ sessionId: state.sessionId, items: state.pendingAttempts });
        const result = await closeSession(state.sessionId, { cards_studied: cardsStudied, cards_correct: cardsCorrect });
        navigate(`/courses/${courseId}/results`, {
          state: {
            sessionId: state.sessionId,
            courseName,
            gameType,
            cards_studied: result.cards_studied ?? cardsStudied,
            cards_correct: result.cards_correct ?? cardsCorrect,
            duration_seconds: result.duration_seconds ?? 0,
            xp_earned: result.xp_earned ?? 0,
          },
          replace: true,
        });
      } else {
        // Nothing to save — just go back to courses.
        navigate(`/courses`, { replace: true });
      }
    } catch {
      flushRef.current.saved = false;
      dispatch({ type: "ERROR", error: "save failed" });
    }
  }, [state, courseId, courseName, gameType, postAttempts, closeSession, navigate]);

  useEffect(() => {
    if (state.phase === PHASE.FINISHING) finishSession();
  }, [state.phase, finishSession]);

  // Keepalive flush on unmount / pagehide for in-app nav-away or tab close.
  // Fire-and-forget; ignore errors. Skipped if finishSession already ran or
  // the user hasn't answered any cards yet.
  useEffect(() => {
    const flush = () => {
      const ref = flushRef.current;
      if (ref.saved) return;
      if (!ref.sessionId) return;
      if (ref.pendingAttempts.length === 0) return;
      ref.saved = true;
      const cardsStudied = Object.keys(ref.firstTryResults).length;
      const cardsCorrect = Object.values(ref.firstTryResults).filter(Boolean).length;
      try {
        postAttempts(
          { sessionId: ref.sessionId, items: ref.pendingAttempts },
          { keepalive: true },
        );
        closeSession(
          ref.sessionId,
          { cards_studied: cardsStudied, cards_correct: cardsCorrect },
          { keepalive: true },
        );
      } catch {
        // fire-and-forget; ignore network/transport errors
      }
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [postAttempts, closeSession]);

  // Auto-speak question on new card, answer on reveal
  useEffect(() => {
    if (!autoSpeak) return;
    const card = state.queue[state.cardIndex];
    if (!card) return;
    if (state.phase === PHASE.QUESTION) tts.speak(card.question, card.question_lang ?? questionLangDefault ?? courseLang);
    if (state.phase === PHASE.ANSWER) tts.speak(card.answer, card.answer_lang ?? answerLangDefault ?? courseLang);
  }, [state.phase, state.cardIndex, autoSpeak]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleShowAnswer = useCallback(() => dispatch({ type: "SHOW_ANSWER" }), []);

  const handleGrade = useCallback((correct, cardMode = "self_grade") => {
    dispatch({ type: "GRADE", correct, responseTimeMs: 0, cardMode });
  }, []);

  const handleEndEarly = useCallback(() => {
    if (state.pendingAttempts.length === 0) {
      navigate(`/courses`, { replace: true });
      return;
    }
    if (window.confirm(t("study.endNowConfirm"))) {
      dispatch({ type: "END_EARLY" });
    }
  }, [state.pendingAttempts.length, navigate, t]);

  const handleMcqPick = useCallback((picked, correct) => {
    dispatch({ type: "MCQ_PICK", picked, correct });
  }, []);

  // Auto-advance after MCQ reveal
  useEffect(() => {
    if (state.phase !== PHASE.MCQ_REVEAL) return;
    const timer = setTimeout(() => {
      handleGrade(state.mcqCorrect, "mcq");
    }, 1200);
    return () => clearTimeout(timer);
  }, [state.phase, state.mcqCorrect, handleGrade]);

  const touchStartX = useRef(null);
  const handleTouchStart = useCallback((e) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);
  const handleTouchEnd = useCallback((e) => {
    if (state.phase !== PHASE.ANSWER) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) < 60) return;
    handleGrade(dx > 0);
  }, [state.phase, handleGrade]);

  const currentCard = state.queue[state.cardIndex] ?? null;
  const cardMode = currentCard ? resolveCardMode(currentCard, mode) : "self_grade";
  const isMcq = cardMode === "mcq";
  const mcqChoices = useMemo(
    () => (isMcq && currentCard) ? shuffleFn([currentCard.answer, ...(currentCard.distractors ?? [])]) : null,
    [currentCard?.id, isMcq], // eslint-disable-line react-hooks/exhaustive-deps
  );

  if (state.phase === PHASE.LOADING) {
    return <div className="study-session">{t("study.loading")}</div>;
  }
  if (state.phase === PHASE.ERROR) {
    return (
      <div className="study-session">
        <p>{t("study.error")}</p>
        <button onClick={() => navigate("/courses")}>{t("study.back")}</button>
      </div>
    );
  }
  if (state.phase === PHASE.EMPTY) {
    return (
      <div className="study-session">
        <p>{t("study.empty")}</p>
        <button onClick={() => navigate("/courses")}>{t("study.back")}</button>
      </div>
    );
  }
  if (state.phase === PHASE.FINISHING) {
    return <div className="study-session">{t("study.finishing")}</div>;
  }

  const card = currentCard;
  const position = state.cardIndex + 1;
  const total = state.queue.length + state.retryPile.length;

  return (
    <div className="study-session">
      <div className="study-progress">
        {t("study.progress", { current: position, total })}
        {isSpeedRound && (
          <span className="speed-timer" data-testid="speed-timer">{t("study.timer", { seconds: timeRemaining })}</span>
        )}
        {ttsAvailable && (
          <button
            className={`speak-toggle ${speechOn ? "on" : "off"}`}
            aria-label={t("study.toggleSpeech")}
            data-testid="speech-toggle"
            onClick={() => setSpeechOn((v) => !v)}
          >
            {speechOn ? "\uD83D\uDD0A" : "\uD83D\uDD07"}
          </button>
        )}
        {!isSpeedRound && (
          <button
            className="btn btn-ghost study-end-now"
            aria-label={t("study.endNowAria")}
            onClick={handleEndEarly}
          >
            {t("study.endNow")}
          </button>
        )}
      </div>

      <div
        className="study-card"
        data-testid="study-card"
        style={{ fontSize: cardFontSize }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="study-question">
          {card.question}
          {canSpeak && (
            <button
              className="speak-btn"
              aria-label={t("study.speakQuestion")}
              onClick={() => tts.speak(card.question, card.question_lang ?? questionLangDefault ?? courseLang)}
            >🔊</button>
          )}
        </div>

        {state.phase === PHASE.ANSWER && (
          <div className="study-answer">
            {card.answer}
            {canSpeak && (
              <button
                className="speak-btn"
                aria-label={t("study.speakAnswer")}
                onClick={() => tts.speak(card.answer, card.answer_lang ?? answerLangDefault ?? courseLang)}
              >🔊</button>
            )}
          </div>
        )}
      </div>

      <div className={`study-actions${(state.phase === PHASE.QUESTION && isMcq) || state.phase === PHASE.MCQ_REVEAL ? " study-actions--mcq" : ""}`}>
        {state.phase === PHASE.QUESTION && !isMcq && (
          <button className="btn btn-primary" onClick={handleShowAnswer}>
            {t("study.showAnswer")}
          </button>
        )}
        {state.phase === PHASE.QUESTION && isMcq && mcqChoices && (
          mcqChoices.map((choice) => (
            <button
              key={choice}
              className="btn btn-ghost"
              onClick={() => handleMcqPick(choice, choice === card.answer)}
            >
              {choice}
            </button>
          ))
        )}
        {state.phase === PHASE.MCQ_REVEAL && mcqChoices && (
          mcqChoices.map((choice) => {
            const isCorrectAnswer = choice === card.answer;
            const wasPicked = choice === state.mcqPicked;
            let cls = "btn btn-ghost mcq-reveal";
            if (isCorrectAnswer) cls += " mcq-correct";
            else if (wasPicked) cls += " mcq-wrong";
            return (
              <button key={choice} className={cls} disabled>
                {choice}
              </button>
            );
          })
        )}
        {state.phase === PHASE.ANSWER && (
          <>
            <button className="btn btn-primary" onClick={() => handleGrade(true)}>
              {t("study.knewIt")}
            </button>
            <button className="btn btn-secondary" onClick={() => handleGrade(false)}>
              {t("study.didntKnow")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
