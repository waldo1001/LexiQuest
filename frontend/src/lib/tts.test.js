import { describe, it, expect, vi } from "vitest";
import { createTts } from "./tts.js";

class FakeUtterance {
  constructor(text) {
    this.text = text;
    this.lang = "";
    this.rate = 1;
  }
}

function makeSynth({ voices = [], speaking = false, pending = false } = {}) {
  return {
    getVoices: () => voices,
    speak: vi.fn(),
    cancel: vi.fn(),
    speaking,
    pending,
    onvoiceschanged: null,
  };
}

const FR = [{ lang: "fr-FR" }];
const NL = [{ lang: "nl-BE" }];

describe("createTts — isAvailable", () => {
  it("returns false when speechSynthesis is null (AC1)", () => {
    expect(createTts(null, FakeUtterance).isAvailable("fr-FR")).toBe(false);
  });

  it("returns false when speechSynthesis is undefined (AC1)", () => {
    expect(createTts(undefined, FakeUtterance).isAvailable("fr-FR")).toBe(false);
  });

  it("returns true when voices not yet loaded — assumes available (AC2)", () => {
    const synth = makeSynth({ voices: [] });
    expect(createTts(synth, FakeUtterance).isAvailable("fr-FR")).toBe(true);
  });

  it("returns true when a loaded voice matches the lang prefix (AC3)", () => {
    const synth = makeSynth({ voices: FR });
    expect(createTts(synth, FakeUtterance).isAvailable("fr-FR")).toBe(true);
  });

  it("returns false when voices loaded but none match (AC4)", () => {
    const synth = makeSynth({ voices: NL });
    expect(createTts(synth, FakeUtterance).isAvailable("fr-FR")).toBe(false);
  });

  it("matches on prefix — fr-CA satisfies an fr-FR request (AC5)", () => {
    const synth = makeSynth({ voices: [{ lang: "fr-CA" }] });
    expect(createTts(synth, FakeUtterance).isAvailable("fr-FR")).toBe(true);
  });

  it("is case-insensitive on voice lang property (AC5)", () => {
    const synth = makeSynth({ voices: [{ lang: "FR-FR" }] });
    expect(createTts(synth, FakeUtterance).isAvailable("fr-FR")).toBe(true);
  });
});

describe("createTts — default UtteranceCtor fallback", () => {
  it("treats speak as a no-op when UtteranceCtor is not injected and jsdom has no SpeechSynthesisUtterance", () => {
    // jsdom does not define SpeechSynthesisUtterance, so the fallback resolves to null → speak is a no-op
    const synth = makeSynth({ voices: FR });
    const { speak } = createTts(synth); // no UtteranceCtor
    expect(() => speak("bonjour", "fr-FR")).not.toThrow();
    expect(synth.speak).not.toHaveBeenCalled();
  });

  it("isAvailable still works when UtteranceCtor not injected", () => {
    const synth = makeSynth({ voices: FR });
    const { isAvailable } = createTts(synth); // no UtteranceCtor
    expect(isAvailable("fr-FR")).toBe(true);
  });
});

describe("createTts — optional chaining on getVoices", () => {
  it("isAvailable returns true when synth has no getVoices method", () => {
    const synthNoGetVoices = { speak: vi.fn(), cancel: vi.fn(), onvoiceschanged: null };
    const { isAvailable } = createTts(synthNoGetVoices, FakeUtterance);
    expect(isAvailable("fr-FR")).toBe(true); // treats as voices-not-loaded
  });

  it("speak defers via onvoiceschanged when synth has no getVoices method", () => {
    const synthNoGetVoices = { speak: vi.fn(), cancel: vi.fn(), onvoiceschanged: null };
    const { speak } = createTts(synthNoGetVoices, FakeUtterance);
    speak("hallo", "nl-BE");
    expect(synthNoGetVoices.speak).not.toHaveBeenCalled();
    synthNoGetVoices.onvoiceschanged();
    expect(synthNoGetVoices.speak).toHaveBeenCalledOnce();
  });
});

describe("createTts — speak", () => {
  it("is a no-op when speechSynthesis is null (AC6)", () => {
    const { speak } = createTts(null, FakeUtterance);
    expect(() => speak("bonjour", "fr-FR")).not.toThrow();
  });

  it("is a no-op when UtteranceCtor is unavailable (AC6)", () => {
    const synth = makeSynth({ voices: FR });
    const { speak } = createTts(synth, null);
    expect(() => speak("bonjour", "fr-FR")).not.toThrow();
    expect(synth.speak).not.toHaveBeenCalled();
  });

  it("cancels current speech then speaks the utterance when speaking (AC7)", () => {
    const synth = makeSynth({ voices: FR, speaking: true });
    createTts(synth, FakeUtterance).speak("bonjour", "fr-FR");
    expect(synth.cancel).toHaveBeenCalledOnce();
    expect(synth.speak).toHaveBeenCalledOnce();
  });

  it("skips cancel when nothing is speaking or pending (AC7b)", () => {
    const synth = makeSynth({ voices: FR, speaking: false, pending: false });
    createTts(synth, FakeUtterance).speak("bonjour", "fr-FR");
    expect(synth.cancel).not.toHaveBeenCalled();
    expect(synth.speak).toHaveBeenCalledOnce();
  });

  it("cancels when utterance is pending but not yet speaking (AC7c)", () => {
    const synth = makeSynth({ voices: FR, pending: true });
    createTts(synth, FakeUtterance).speak("bonjour", "fr-FR");
    expect(synth.cancel).toHaveBeenCalledOnce();
  });

  it("sets correct lang and default rate on the utterance (AC8)", () => {
    const synth = makeSynth({ voices: FR });
    createTts(synth, FakeUtterance).speak("bonjour", "fr-FR");
    const u = synth.speak.mock.calls[0][0];
    expect(u.text).toBe("bonjour");
    expect(u.lang).toBe("fr-FR");
    expect(u.rate).toBeCloseTo(0.9);
  });

  it("uses a custom rate when provided (AC8)", () => {
    const synth = makeSynth({ voices: FR });
    createTts(synth, FakeUtterance).speak("bonjour", "fr-FR", 0.7);
    expect(synth.speak.mock.calls[0][0].rate).toBeCloseTo(0.7);
  });

  it("defers speaking until onvoiceschanged fires when voices empty (AC9)", () => {
    const synth = makeSynth({ voices: [] });
    createTts(synth, FakeUtterance).speak("hallo", "nl-BE");
    expect(synth.speak).not.toHaveBeenCalled();
    synth.onvoiceschanged();
    expect(synth.speak).toHaveBeenCalledOnce();
  });

  it("clears onvoiceschanged handler after firing (AC10)", () => {
    const synth = makeSynth({ voices: [] });
    createTts(synth, FakeUtterance).speak("hallo", "nl-BE");
    synth.onvoiceschanged();
    expect(synth.onvoiceschanged).toBeNull();
  });

  it("passes correct text to deferred utterance (AC9)", () => {
    const synth = makeSynth({ voices: [] });
    createTts(synth, FakeUtterance).speak("goedemorgen", "nl-BE");
    synth.onvoiceschanged();
    const u = synth.speak.mock.calls[0][0];
    expect(u.text).toBe("goedemorgen");
    expect(u.lang).toBe("nl-BE");
  });
});
