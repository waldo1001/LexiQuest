import type {
  CardCandidate,
  ClaudeClient,
  EnrichInput,
  ExtractCardsInput,
} from "../src/shared/claude.js";

/**
 * FakeClaudeClient — scripted responses for unit tests.
 *
 * Usage:
 *   const claude = new FakeClaudeClient();
 *   claude.nextCards = [{ question: "Q", answer: "A", distractors: ["X", "Y"] }];
 *   // or throw:
 *   claude.nextError = new Error("rate limit");
 */
export class FakeClaudeClient implements ClaudeClient {
  nextCards: CardCandidate[] = [];
  nextError: Error | null = null;
  nextEnrich: Array<{ id: string; distractors: [string, string] }> = [];
  nextEnrichError: Error | null = null;

  readonly extractCardsInputs: ExtractCardsInput[] = [];
  readonly enrichInputs: EnrichInput[] = [];

  async extractCards(input: ExtractCardsInput): Promise<CardCandidate[]> {
    this.extractCardsInputs.push(input);
    if (this.nextError) throw this.nextError;
    return this.nextCards;
  }

  async enrichDistractors(
    input: EnrichInput,
  ): Promise<Array<{ id: string; distractors: [string, string] }>> {
    this.enrichInputs.push(input);
    if (this.nextEnrichError) throw this.nextEnrichError;
    return this.nextEnrich;
  }
}
