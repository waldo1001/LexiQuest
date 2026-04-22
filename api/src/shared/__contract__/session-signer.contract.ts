import { describe, it, expect } from "vitest";
import type { SessionSigner } from "../session-signer.js";
import type { FakeClock } from "../../../testing/fake-clock.js";

type Factory = () => { signer: SessionSigner; clock: FakeClock };

export function runSessionSignerContract(label: string, factory: Factory): void {
  describe(`SessionSigner contract — ${label}`, () => {
    it("verify(sign(payload)) returns the payload", () => {
      const { signer } = factory();
      const p = {
        userId: "u1",
        isAdmin: false,
        expMs: new Date("2099-01-01").getTime(),
      };
      expect(signer.verify(signer.sign(p))).toEqual(p);
    });

    it("tampered tokens fail to verify", () => {
      const { signer } = factory();
      const token = signer.sign({
        userId: "u1",
        isAdmin: false,
        expMs: new Date("2099-01-01").getTime(),
      });
      const tampered = token.slice(0, -1) + (token.slice(-1) === "a" ? "b" : "a");
      expect(signer.verify(tampered)).toBeNull();
    });

    it("malformed tokens return null", () => {
      const { signer } = factory();
      expect(signer.verify("not-a-token")).toBeNull();
      expect(signer.verify("")).toBeNull();
    });

    it("expired tokens return null", () => {
      const { signer, clock } = factory();
      const expMs = clock.nowMs() + 1000;
      const token = signer.sign({ userId: "u1", isAdmin: false, expMs });
      expect(signer.verify(token)).not.toBeNull();
      clock.advance(2000);
      expect(signer.verify(token)).toBeNull();
    });
  });
}
