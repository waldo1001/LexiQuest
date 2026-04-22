import { describe, it, expect } from "vitest";
import { HmacSessionSigner } from "./session-signer.js";
import { FakeClock } from "../../testing/fake-clock.js";

const SECRET = "test-secret-32-bytes-abcdefghijk";

describe("HmacSessionSigner", () => {
  it("throws on short secrets", () => {
    expect(
      () =>
        new HmacSessionSigner({
          secret: "too-short",
          clock: new FakeClock(),
        }),
    ).toThrow(/>= 16/);
  });

  it("different secrets produce different tokens", () => {
    const a = new HmacSessionSigner({
      secret: SECRET,
      clock: new FakeClock(),
    });
    const b = new HmacSessionSigner({
      secret: SECRET.replace("a", "z"),
      clock: new FakeClock(),
    });
    const p = { userId: "u1", isAdmin: false, expMs: 9e15 };
    expect(a.sign(p)).not.toBe(b.sign(p));
  });

  it("verify returns null for a token signed with a different secret", () => {
    const clock = new FakeClock();
    const a = new HmacSessionSigner({ secret: SECRET, clock });
    const b = new HmacSessionSigner({
      secret: "another-secret-32-bytes-aaaaaaaa",
      clock,
    });
    const token = a.sign({ userId: "u1", isAdmin: false, expMs: 9e15 });
    expect(b.verify(token)).toBeNull();
  });

  it("verify rejects tokens whose JSON payload has wrong types", () => {
    const clock = new FakeClock();
    const signer = new HmacSessionSigner({ secret: SECRET, clock });
    // Forge a token with a bad payload and a matching-HMAC.
    // Use an instance with the same secret to sign a malformed body.
    const forgerySigner = new (class extends HmacSessionSigner {
      forgeWithBadPayload(): string {
        const body = Buffer.from(JSON.stringify({ userId: 42 }))
          .toString("base64")
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/g, "");
        const { createHmac } = require("node:crypto") as typeof import("node:crypto");
        const sig = createHmac("sha256", SECRET).update(body).digest();
        const sig64 = sig
          .toString("base64")
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/g, "");
        return `${body}.${sig64}`;
      }
    })({ secret: SECRET, clock });
    expect(signer.verify(forgerySigner.forgeWithBadPayload())).toBeNull();
  });

  it("verify tolerates junk base64 in the signature", () => {
    const clock = new FakeClock();
    const signer = new HmacSessionSigner({ secret: SECRET, clock });
    const token = signer.sign({ userId: "u1", isAdmin: false, expMs: 9e15 });
    const mangled = `${token.split(".")[0]}.%%%`;
    expect(signer.verify(mangled)).toBeNull();
  });
});
