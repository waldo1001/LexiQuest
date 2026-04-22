import type { Clock } from "../src/shared/clock.js";
import type {
  SessionPayload,
  SessionSigner,
} from "../src/shared/session-signer.js";

/**
 * Non-cryptographic signer that still exercises the verify-rejects-
 * -tampered-tokens / verify-rejects-expired-tokens pathways.
 * Token format: `<json>.<mark>` where `<mark>` is a fixed string
 * plus length(json).
 */
export class FakeSessionSigner implements SessionSigner {
  constructor(
    private readonly clock: Clock,
    private readonly secret: string = "fake-secret",
  ) {}

  sign(payload: SessionPayload): string {
    const body = JSON.stringify(payload);
    const sig = `${this.secret}:${body.length}`;
    return `${body}.${sig}`;
  }

  verify(token: string): SessionPayload | null {
    const idx = token.lastIndexOf(".");
    if (idx === -1) return null;
    const body = token.slice(0, idx);
    const sig = token.slice(idx + 1);
    if (sig !== `${this.secret}:${body.length}`) return null;
    let payload: SessionPayload;
    try {
      payload = JSON.parse(body) as SessionPayload;
    } catch {
      return null;
    }
    if (
      typeof payload.userId !== "string" ||
      typeof payload.isAdmin !== "boolean" ||
      typeof payload.expMs !== "number"
    ) {
      return null;
    }
    if (payload.expMs < this.clock.nowMs()) return null;
    return payload;
  }
}
