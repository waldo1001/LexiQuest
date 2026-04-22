// Example: Fake ClaudeClient for LexiQuest tests.
// Copy into api/testing/fake-claude-client.ts at Phase 12.
//
// Contract: see ../../docs/tdd/testability-patterns.md §3.2.

export interface CardCandidate {
  question: string;
  answer: string;
  distractors: [string, string];
}

export interface ExtractCardsInput {
  imageBase64: string;
  courseName: string;
  courseLanguage: string | null;
  uiLanguage: "nl" | "en";
}

export interface EnrichInput {
  courseName: string;
  courseLanguage: string | null;
  uiLanguage: "nl" | "en";
  cards: ReadonlyArray<{ id: string; question: string; answer: string }>;
}

export interface ClaudeClient {
  extractCards(input: ExtractCardsInput): Promise<CardCandidate[]>;
  enrichDistractors(
    input: EnrichInput,
  ): Promise<Array<{ id: string; distractors: [string, string] }>>;
}

// Typed error surface — business logic discriminates on these.
export class ClaudeJsonParseError extends Error {
  constructor(
    message: string,
    public readonly rawText: string,
  ) {
    super(message);
    this.name = "ClaudeJsonParseError";
  }
}

export class ClaudeRateLimitedError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super("Claude API rate limited");
    this.name = "ClaudeRateLimitedError";
  }
}

type ExtractScript =
  | { kind: "ok"; cards: CardCandidate[] }
  | { kind: "markdown-fenced-ok"; cards: CardCandidate[] }
  | { kind: "parse-error"; rawText: string }
  | { kind: "rate-limited"; retryAfterMs: number };

type EnrichScript =
  | { kind: "ok"; items: Array<{ id: string; distractors: [string, string] }> }
  | { kind: "parse-error"; rawText: string }
  | { kind: "rate-limited"; retryAfterMs: number };

export class FakeClaudeClient implements ClaudeClient {
  private extractQueue: ExtractScript[] = [];
  private enrichQueue: EnrichScript[] = [];
  public calls: {
    extract: ExtractCardsInput[];
    enrich: EnrichInput[];
  } = { extract: [], enrich: [] };

  scriptExtract(step: ExtractScript): void {
    this.extractQueue.push(step);
  }

  scriptEnrich(step: EnrichScript): void {
    this.enrichQueue.push(step);
  }

  async extractCards(input: ExtractCardsInput): Promise<CardCandidate[]> {
    this.calls.extract.push(input);
    const step = this.extractQueue.shift();
    if (!step) {
      throw new Error(
        `FakeClaudeClient.extractCards: no scripted step for call #${this.calls.extract.length}`,
      );
    }
    switch (step.kind) {
      case "ok":
        return step.cards;
      case "markdown-fenced-ok":
        // The real client strips ```json fences; the fake simulates the
        // pre-strip text so a test can assert the real client would handle
        // it — not useful here as the fake returns the parsed output, but
        // illustrative.
        return step.cards;
      case "parse-error":
        throw new ClaudeJsonParseError(
          "unparseable Claude response",
          step.rawText,
        );
      case "rate-limited":
        throw new ClaudeRateLimitedError(step.retryAfterMs);
    }
  }

  async enrichDistractors(
    input: EnrichInput,
  ): Promise<Array<{ id: string; distractors: [string, string] }>> {
    this.calls.enrich.push(input);
    const step = this.enrichQueue.shift();
    if (!step) {
      throw new Error(
        `FakeClaudeClient.enrichDistractors: no scripted step for call #${this.calls.enrich.length}`,
      );
    }
    switch (step.kind) {
      case "ok":
        return step.items;
      case "parse-error":
        throw new ClaudeJsonParseError(
          "unparseable Claude response",
          step.rawText,
        );
      case "rate-limited":
        throw new ClaudeRateLimitedError(step.retryAfterMs);
    }
  }
}
