import { createHmac, timingSafeEqual } from "node:crypto";
import type { Clock } from "./clock.js";

export interface SessionPayload {
  userId: string;
  isAdmin: boolean;
  /** Expiry as epoch ms. */
  expMs: number;
}

export interface SessionSigner {
  sign(payload: SessionPayload): string;
  /** Returns the payload, or null if the token is invalid / tampered / expired. */
  verify(token: string): SessionPayload | null;
}

function base64UrlEncode(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf, "utf8") : buf;
  return b
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(s: string): Buffer {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

export interface HmacSessionSignerOptions {
  secret: string;
  clock: Clock;
}

export class HmacSessionSigner implements SessionSigner {
  private readonly secret: string;
  private readonly clock: Clock;

  constructor(options: HmacSessionSignerOptions) {
    if (options.secret.length < 16) {
      throw new Error("session secret must be >= 16 bytes");
    }
    this.secret = options.secret;
    this.clock = options.clock;
  }

  sign(payload: SessionPayload): string {
    const body = base64UrlEncode(JSON.stringify(payload));
    const sig = base64UrlEncode(
      createHmac("sha256", this.secret).update(body).digest(),
    );
    return `${body}.${sig}`;
  }

  verify(token: string): SessionPayload | null {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [body, sig] = parts as [string, string];
    let expected: Buffer;
    try {
      expected = createHmac("sha256", this.secret).update(body).digest();
    } catch {
      return null;
    }
    let given: Buffer;
    try {
      given = base64UrlDecode(sig);
    } catch {
      return null;
    }
    if (given.length !== expected.length) return null;
    if (!timingSafeEqual(given, expected)) return null;

    let payload: SessionPayload;
    try {
      payload = JSON.parse(base64UrlDecode(body).toString("utf8")) as SessionPayload;
    } catch {
      return null;
    }
    if (
      typeof payload !== "object" ||
      payload === null ||
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
