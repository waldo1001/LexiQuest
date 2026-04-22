import { randomUUID } from "node:crypto";

export interface Random {
  /** Return a v4 UUID. */
  uuid(): string;
  /** Return a Fisher-Yates-shuffled copy of the input (non-mutating). */
  shuffle<T>(input: readonly T[]): T[];
}

export class SystemRandom implements Random {
  uuid(): string {
    return randomUUID();
  }

  shuffle<T>(input: readonly T[]): T[] {
    const out = input.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const ai = out[i] as T;
      const aj = out[j] as T;
      out[i] = aj;
      out[j] = ai;
    }
    return out;
  }
}
