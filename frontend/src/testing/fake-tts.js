/**
 * FakeTts — records speak() calls so tests can assert on them.
 *
 * Usage:
 *   const tts = createFakeTts();
 *   render(<AppProvider tts={tts}> ... </AppProvider>);
 *   // after interaction:
 *   expect(tts.lastSpoken).toEqual({ text: 'bonjour', lang: 'fr-FR', rate: 0.9 });
 *
 * @param {{ available?: boolean }} [options]
 */
export function createFakeTts({ available = true } = {}) {
  const spokenItems = [];
  return {
    isAvailable: (_lang) => available,
    speak(text, lang, rate = 0.9) {
      spokenItems.push({ text, lang, rate });
    },
    get lastSpoken() {
      return spokenItems.length > 0 ? spokenItems[spokenItems.length - 1] : null;
    },
    spokenItems,
  };
}
