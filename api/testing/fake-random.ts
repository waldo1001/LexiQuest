import type { Random } from "../src/shared/random.js";

/**
 * Scripted Random: returns the given UUIDs in order and shuffles by
 * the given permutation indices. Throws on overrun so tests fail
 * loudly rather than quietly falling back to real randomness.
 */
export class FakeRandom implements Random {
  private uuidIndex = 0;
  private shuffleIndex = 0;

  constructor(
    private readonly scriptedUuids: readonly string[] = [],
    /** Each entry is a permutation (indices of the input array). */
    private readonly scriptedShuffles: ReadonlyArray<readonly number[]> = [],
  ) {}

  uuid(): string {
    const next = this.scriptedUuids[this.uuidIndex];
    if (next === undefined) {
      throw new Error(
        `FakeRandom.uuid(): script exhausted at index ${this.uuidIndex}`,
      );
    }
    this.uuidIndex += 1;
    return next;
  }

  shuffle<T>(input: readonly T[]): T[] {
    const perm = this.scriptedShuffles[this.shuffleIndex];
    if (perm === undefined) {
      throw new Error(
        `FakeRandom.shuffle(): script exhausted at index ${this.shuffleIndex}`,
      );
    }
    if (perm.length !== input.length) {
      throw new Error(
        `FakeRandom.shuffle(): permutation length ${perm.length} != input length ${input.length}`,
      );
    }
    this.shuffleIndex += 1;
    return perm.map((i) => {
      const v = input[i];
      if (v === undefined) {
        throw new Error(
          `FakeRandom.shuffle(): permutation index ${i} out of bounds`,
        );
      }
      return v;
    });
  }
}
