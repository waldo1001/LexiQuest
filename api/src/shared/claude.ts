import Anthropic from "@anthropic-ai/sdk";

export interface CardCandidate {
  question: string;
  answer: string;
  distractors: [string, string];
}

export interface ExtractCardsInput {
  imageBase64: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  courseName: string;
  courseLanguage: string | null;
  uiLanguage: string;
}

export interface EnrichInput {
  cards: Array<{ id: string; question: string; answer: string }>;
}

export interface ClaudeClient {
  extractCards(input: ExtractCardsInput): Promise<CardCandidate[]>;
  enrichDistractors(
    input: EnrichInput,
  ): Promise<Array<{ id: string; distractors: [string, string] }>>;
}

export class ClaudeJsonParseError extends Error {
  constructor(
    message: string,
    public readonly raw: string,
  ) {
    super(message);
    this.name = "ClaudeJsonParseError";
  }
}

const MODEL = "claude-sonnet-4-6";

/** Strip optional markdown code fences Claude sometimes wraps around JSON. */
export function stripFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

/** Parse and validate a JSON array of card candidates. */
export function parseCards(raw: string): CardCandidate[] {
  const stripped = stripFences(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    throw new ClaudeJsonParseError("Response is not valid JSON", stripped);
  }
  if (!Array.isArray(parsed)) {
    throw new ClaudeJsonParseError("Expected a JSON array", stripped);
  }
  return parsed as CardCandidate[];
}

/* v8 ignore start */
export function createClaudeClient(apiKey: string): ClaudeClient {
  const client = new Anthropic({ apiKey });

  return {
    async extractCards(input) {
      const langLine = input.courseLanguage
        ? `Course language: ${input.courseLanguage}`
        : "Course language: not specified";

      const prompt = `You are extracting study cards from a student's study material.
For each learnable item, return:
- question: the prompt side
- answer: the correct response (use | for valid alternatives)
- distractors: exactly 2 plausible-but-wrong alternatives of the same type/category, never valid synonyms

Context:
- Course name: ${input.courseName}
- ${langLine}
- User UI language: ${input.uiLanguage}

Return JSON only — no prose, no markdown fences:
[{"question":"...","answer":"...","distractors":["...","..."]}]`;

      const msg = await client.messages.create({
        model: MODEL,
        max_tokens: 2048,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: input.mimeType,
                  data: input.imageBase64,
                },
              },
              { type: "text", text: prompt },
            ],
          },
        ],
      });

      const block = msg.content.find((b) => b.type === "text");
      const raw = block && block.type === "text" ? block.text : "";
      return parseCards(raw);
    },

    async enrichDistractors(input) {
      const cardList = input.cards
        .map((c) => `{"id":"${c.id}","question":"${c.question}","answer":"${c.answer}"}`)
        .join(",\n");

      const prompt = `For each Q/A pair, generate exactly 2 plausible-but-wrong distractors of the same type as the answer. Never use valid synonyms.
Return JSON only:
[{"id":"...","distractors":["...","..."]}]

Cards:
[${cardList}]`;

      const msg = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      });

      const block = msg.content.find((b) => b.type === "text");
      const raw = block && block.type === "text" ? block.text : "";
      const stripped = stripFences(raw);
      return JSON.parse(stripped);
    },
  };
}
/* v8 ignore stop */
