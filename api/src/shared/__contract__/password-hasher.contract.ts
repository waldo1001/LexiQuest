import { describe, it, expect } from "vitest";
import type { PasswordHasher } from "../password-hasher.js";

type Factory = () => PasswordHasher;

export function runPasswordHasherContract(
  label: string,
  factory: Factory,
): void {
  describe(`PasswordHasher contract — ${label}`, () => {
    it("verify returns true on matching password + hash", async () => {
      const h = factory();
      const hashed = await h.hash("sekret");
      expect(await h.verify("sekret", hashed)).toBe(true);
    });

    it("verify returns false on wrong password", async () => {
      const h = factory();
      const hashed = await h.hash("sekret");
      expect(await h.verify("wrong", hashed)).toBe(false);
    });

    it("hash produces a different output per call (salted)", async () => {
      const h = factory();
      const a = await h.hash("same");
      const b = await h.hash("same");
      expect(a).not.toBe(b);
    });

    it("hash output is not empty or obviously plaintext", async () => {
      const h = factory();
      const hashed = await h.hash("sekret");
      expect(hashed.length).toBeGreaterThanOrEqual(12);
      expect(hashed).not.toBe("sekret");
    });
  });
}
