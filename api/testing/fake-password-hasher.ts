import type { PasswordHasher } from "../src/shared/password-hasher.js";

/**
 * Salted, deterministic-per-call fake. Hash output is
 * `fake$<salt>$<plaintext>` where `salt` is a monotonic counter so
 * successive calls produce different outputs (salted property).
 *
 * Verify is a straight equality check of the plaintext against the
 * `plaintext` segment of the hash. Not cryptographically secure —
 * tests only.
 */
export class FakePasswordHasher implements PasswordHasher {
  private counter = 0;

  async hash(plaintext: string): Promise<string> {
    this.counter += 1;
    const salt = `s${this.counter.toString().padStart(4, "0")}`;
    return `fake$${salt}$${plaintext}`;
  }

  async verify(plaintext: string, hashed: string): Promise<boolean> {
    const parts = hashed.split("$");
    if (parts.length !== 3 || parts[0] !== "fake") return false;
    return parts[2] === plaintext;
  }
}
