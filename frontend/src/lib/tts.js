/**
 * TTS seam — wraps window.speechSynthesis so screens never touch it directly.
 *
 * @param {SpeechSynthesis|null|undefined} speechSynthesis
 * @param {typeof SpeechSynthesisUtterance} [UtteranceCtor] — injectable for tests
 */
export const createTts = (speechSynthesis, UtteranceCtor) => {
  const _Ctor =
    UtteranceCtor ??
    /* v8 ignore next -- SpeechSynthesisUtterance is defined in browsers but not in jsdom */
    (typeof SpeechSynthesisUtterance !== "undefined" ? SpeechSynthesisUtterance : null);

  const isAvailable = (lang) => {
    if (!speechSynthesis) return false;
    const voices = speechSynthesis.getVoices?.() ?? [];
    if (voices.length === 0) return true; // voices not loaded yet — assume available
    const prefix = lang.split("-")[0].toLowerCase();
    return voices.some((v) => v.lang.toLowerCase().startsWith(prefix));
  };

  const speak = (text, lang, rate = 0.9) => {
    if (!speechSynthesis || !_Ctor) return;
    const trySpeak = () => {
      try {
        // Only cancel if actively speaking/pending — avoids Safari crash
        // where cancel() during audio teardown corrupts JSC allocator state
        if (speechSynthesis.speaking || speechSynthesis.pending) {
          speechSynthesis.cancel();
        }
        const u = new _Ctor(text);
        u.lang = lang;
        u.rate = rate;
        speechSynthesis.speak(u);
      } catch {
        // Swallow — TTS is best-effort, never worth crashing for
      }
    };
    const voices = speechSynthesis.getVoices?.() ?? [];
    if (voices.length === 0) {
      speechSynthesis.onvoiceschanged = () => {
        speechSynthesis.onvoiceschanged = null;
        trySpeak();
      };
    } else {
      trySpeak();
    }
  };

  return { isAvailable, speak };
};
