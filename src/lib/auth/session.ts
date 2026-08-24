// Session tokens: an HMAC-signed cookie, not a JWT library.
//
// jose buys JWKS, key rotation and third-party interop. The same process signs
// and verifies here, there is one key, and nothing else ever reads the token —
// so all of that is weight. createHmac is fifteen lines and ships nothing.

import { createHmac, timingSafeEqual } from "node:crypto";

export interface SessionPayload {
  aid: number; // Account.id — the authority
  name: string; // display cache for the header badge, so it needs no DB round trip.
  // Goes stale if the account is renamed, until the next login. Never trust it
  // for anything but rendering.
  iat: number; // seconds
  exp: number; // seconds
}

export const SESSION_COOKIE = "predictor_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

/**
 * One shared options object so the login route and the logout route cannot
 * drift apart.
 *
 * sameSite "lax" is load-bearing: it is the *entire* CSRF defence for
 * POST /api/bets, PATCH|DELETE /api/bets/[id], POST /api/bankroll and
 * POST /api/bets/settle. A cross-site form cannot send the cookie with those.
 * Do not weaken it to "none" without adding a real CSRF token first.
 *
 * secure is env-conditional so http://localhost still works in dev.
 */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
} as const;

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value) {
    throw new Error(
      "SESSION_SECRET is not set. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\""
    );
  }
  return value;
}

function sign(body: string): string {
  return createHmac("sha256", secret()).update(body).digest("base64url");
}

export function createSessionToken(account: { id: number; name: string }): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    aid: account.id,
    name: account.name,
    iat: now,
    exp: now + SESSION_MAX_AGE_SECONDS,
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${sign(body)}`;
}

/**
 * Returns the payload, or null for anything that isn't a live token we signed.
 *
 * The signature is checked BEFORE the body is parsed — never hand attacker-
 * controlled bytes to JSON.parse on the strength of them merely looking like a
 * token. Rotating SESSION_SECRET invalidates every outstanding session, which is
 * the revocation mechanism.
 */
export function verifySessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;

  const dot = token.indexOf(".");
  if (dot <= 0 || dot !== token.lastIndexOf(".")) return null;

  const body = token.slice(0, dot);
  const provided = Buffer.from(token.slice(dot + 1), "base64url");
  const expected = Buffer.from(sign(body), "base64url");
  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (typeof payload?.aid !== "number" || typeof payload?.name !== "string") return null;
  if (typeof payload?.exp !== "number" || payload.exp <= Math.floor(Date.now() / 1000)) return null;

  return payload;
}
