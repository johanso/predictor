import { describe, it, expect, beforeAll } from "vitest";
import { createHmac } from "node:crypto";

const SECRET = "test-secret-not-the-real-one";
beforeAll(() => {
  process.env.SESSION_SECRET = SECRET;
});

const { createSessionToken, verifySessionToken } = await import("@/lib/auth/session");

const ACCOUNT = { id: 7, name: "Bet365" };

function signWith(body: string, secret: string): string {
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}

function encode(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

describe("session tokens", () => {
  it("round-trips the account", () => {
    const payload = verifySessionToken(createSessionToken(ACCOUNT));
    expect(payload?.aid).toBe(7);
    expect(payload?.name).toBe("Bet365");
  });

  it("rejects a tampered payload", () => {
    const token = createSessionToken(ACCOUNT);
    const forged = `${encode({ aid: 99, name: "Otra", iat: 0, exp: 9_999_999_999 })}.${token.split(".")[1]}`;
    expect(verifySessionToken(forged)).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const [body, sig] = createSessionToken(ACCOUNT).split(".");
    // Flip a character in the middle, not the last one: base64url's final character
    // carries padding bits that can decode to the same bytes either way.
    const i = Math.floor(sig.length / 2);
    const flipped = sig.slice(0, i) + (sig[i] === "A" ? "B" : "A") + sig.slice(i + 1);
    expect(verifySessionToken(`${body}.${flipped}`)).toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    const now = Math.floor(Date.now() / 1000);
    const body = encode({ aid: 7, name: "Bet365", iat: now, exp: now + 600 });
    expect(verifySessionToken(signWith(body, "some-other-secret"))).toBeNull();
  });

  it("rejects an expired token", () => {
    const now = Math.floor(Date.now() / 1000);
    const body = encode({ aid: 7, name: "Bet365", iat: now - 100, exp: now - 1 });
    expect(verifySessionToken(signWith(body, SECRET))).toBeNull();
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["empty", ""],
    ["no separator", "abcdef"],
    ["two separators", "a.b.c"],
    ["empty body", ".signature"],
  ])("rejects structurally invalid input (%s)", (_label, token) => {
    expect(verifySessionToken(token as string | null | undefined)).toBeNull();
  });

  // The signature must be checked before the body is parsed. These two cases pin
  // both halves: correctly signed garbage must not crash, and unsigned garbage must
  // be rejected without JSON.parse ever seeing it.
  it("does not throw on a correctly signed body that is not JSON", () => {
    const body = Buffer.from("not json at all", "utf8").toString("base64url");
    expect(verifySessionToken(signWith(body, SECRET))).toBeNull();
  });

  it("rejects unsigned garbage", () => {
    const body = Buffer.from("{{{{", "utf8").toString("base64url");
    expect(verifySessionToken(`${body}.notasignature`)).toBeNull();
  });

  it("rejects a signed payload missing its fields", () => {
    const now = Math.floor(Date.now() / 1000);
    for (const payload of [{ name: "x", exp: now + 60 }, { aid: 1, exp: now + 60 }, { aid: 1, name: "x" }]) {
      expect(verifySessionToken(signWith(encode(payload), SECRET))).toBeNull();
    }
  });
});
