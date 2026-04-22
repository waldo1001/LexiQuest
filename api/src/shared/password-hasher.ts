export interface PasswordHasher {
  /** Hash a plaintext password. Return value includes salt + cost. */
  hash(plaintext: string): Promise<string>;
  /** Verify a plaintext against a previously hashed value. */
  verify(plaintext: string, hashed: string): Promise<boolean>;
}
