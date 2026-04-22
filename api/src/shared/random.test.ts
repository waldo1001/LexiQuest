import { describe, it, expect } from "vitest";
import { SystemRandom } from "./random.js";
import { FakeRandom } from "../../testing/fake-random.js";

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("SystemRandom", () => {
  it("uuid() returns a v4 UUID string", () => {
    const r = new SystemRandom();
    expect(r.uuid()).toMatch(UUID_V4);
  });

  it("shuffle returns a new array of the same length and elements", () => {
    const r = new SystemRandom();
    const input = [1, 2, 3, 4, 5];
    const out = r.shuffle(input);
    expect(out).toHaveLength(5);
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5]);
    expect(out).not.toBe(input);
  });

  it("shuffle of a single element returns the same element", () => {
    const r = new SystemRandom();
    expect(r.shuffle(["a"])).toEqual(["a"]);
  });

  it("shuffle of empty returns empty", () => {
    const r = new SystemRandom();
    expect(r.shuffle([])).toEqual([]);
  });
});

describe("FakeRandom", () => {
  it("returns scripted UUIDs in order", () => {
    const r = new FakeRandom(["u1", "u2"]);
    expect(r.uuid()).toBe("u1");
    expect(r.uuid()).toBe("u2");
  });

  it("throws when uuid script is exhausted", () => {
    const r = new FakeRandom(["u1"]);
    r.uuid();
    expect(() => r.uuid()).toThrow(/exhausted/);
  });

  it("applies scripted shuffles by permutation indices", () => {
    const r = new FakeRandom([], [[2, 0, 1]]);
    expect(r.shuffle(["a", "b", "c"])).toEqual(["c", "a", "b"]);
  });

  it("throws when shuffle script is exhausted", () => {
    const r = new FakeRandom();
    expect(() => r.shuffle(["a"])).toThrow(/exhausted/);
  });

  it("throws when permutation length mismatches", () => {
    const r = new FakeRandom([], [[0, 1]]);
    expect(() => r.shuffle(["a", "b", "c"])).toThrow(/length/);
  });

  it("throws when a permutation index is out of bounds", () => {
    const r = new FakeRandom([], [[0, 5]]);
    expect(() => r.shuffle(["a", "b"])).toThrow(/out of bounds/);
  });
});
