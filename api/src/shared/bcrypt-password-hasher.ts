/* v8 ignore start */
import bcrypt from "bcryptjs";
import type { PasswordHasher } from "./password-hasher.js";

export interface BcryptPasswordHasherOptions {
  /** Cost factor; defaults to 10 for production. Tests use 4. */
  cost?: number;
}

export class BcryptPasswordHasher implements PasswordHasher {
  private readonly cost: number;

  constructor(options: BcryptPasswordHasherOptions = {}) {
    this.cost = options.cost ?? 10;
  }

  async hash(plaintext: string): Promise<string> {
    return bcrypt.hash(plaintext, this.cost);
  }

  async verify(plaintext: string, hashed: string): Promise<boolean> {
    return bcrypt.compare(plaintext, hashed);
  }
}
/* v8 ignore stop */
