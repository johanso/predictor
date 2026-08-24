import { describe, it, expect } from "vitest";
import { generateCode, hashCode, verifyCode } from "@/lib/auth/codes";

describe("hashCode / verifyCode", () => {
  it("accepts the code it was derived from", async () => {
    const stored = await hashCode("SUPERSECRETCODE1");
    expect(await verifyCode("SUPERSECRETCODE1", stored)).toBe(true);
  });

  it("never stores the plaintext", async () => {
    const stored = await hashCode("SUPERSECRETCODE1");
    expect(stored).not.toContain("SUPERSECRETCODE1");
  });

  it("salts every hash separately, so two accounts sharing a code look unrelated", async () => {
    const a = await hashCode("SAMECODE12345678");
    const b = await hashCode("SAMECODE12345678");
    expect(a).not.toBe(b);
    expect(await verifyCode("SAMECODE12345678", a)).toBe(true);
    expect(await verifyCode("SAMECODE12345678", b)).toBe(true);
  });

  it("rejects a wrong, truncated, extended or empty code", async () => {
    const stored = await hashCode("SUPERSECRETCODE1");
    expect(await verifyCode("SUPERSECRETCODE2", stored)).toBe(false);
    expect(await verifyCode("SUPERSECRETCODE", stored)).toBe(false);
    expect(await verifyCode("SUPERSECRETCODE12", stored)).toBe(false);
    expect(await verifyCode("", stored)).toBe(false);
  });

  // A corrupt or hand-edited row must return false, not throw — otherwise one bad
  // record 500s the login endpoint for every account.
  it.each([
    ["empty string", ""],
    ["wrong algorithm", "bcrypt$16384$8$1$AAAA$BBBB"],
    ["too few fields", "scrypt$16384$8$1$AAAA"],
    ["non-numeric parameters", "scrypt$x$y$z$AAAA$BBBB"],
    ["empty salt and hash", "scrypt$16384$8$1$$"],
    ["not a hash at all", "hello world"],
  ])("returns false for a malformed stored value (%s)", async (_label, stored) => {
    expect(await verifyCode("SUPERSECRETCODE1", stored)).toBe(false);
  });
});

describe("generateCode", () => {
  it("is 16 characters by default and honours an explicit length", () => {
    expect(generateCode()).toHaveLength(16);
    expect(generateCode(24)).toHaveLength(24);
  });

  it("avoids the glyphs that misread when typed from a phone", () => {
    const sample = Array.from({ length: 200 }, () => generateCode()).join("");
    expect(sample).not.toMatch(/[01OILU]/);
  });

  it("does not repeat itself", () => {
    const codes = new Set(Array.from({ length: 100 }, () => generateCode()));
    expect(codes.size).toBe(100);
  });
});
