// Access-code hashing. An account's code IS its login, so the database must
// never hold anything that can be replayed as one — only a scrypt hash.
//
// Node's crypto, not Web Crypto: scrypt exists only in the Node runtime. That is
// fine everywhere this is called (route handlers and scripts, both Node), and
// src/proxy.ts deliberately never hashes — an 80ms KDF in front of every request
// is not what you want.

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number }
) => Promise<Buffer>;

// N=16384, r=8, p=1 costs ~80ms and fits inside scrypt's default 32MB maxmem —
// raising N without also passing maxmem throws "memory limit exceeded".
// 80ms on a login that happens once a month is free; it is also the only thing
// standing between a leaked URL and the owner's betting history.
const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;
const SALT_BYTES = 16;

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

/** Returns "scrypt$N$r$p$salt$hash", all base64url. Safe to store as-is. */
export async function hashCode(code: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const hash = await scrypt(code, salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${b64url(salt)}$${b64url(hash)}`;
}

/**
 * Constant-time comparison against a stored hash. Returns false — never throws —
 * for any malformed input, so a corrupt row cannot 500 the login endpoint.
 */
export async function verifyCode(code: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4], "base64url");
    expected = Buffer.from(parts[5], "base64url");
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  let actual: Buffer;
  try {
    actual = await scrypt(code, salt, expected.length, { N: n, r, p });
  } catch {
    return false; // absurd parameters in a tampered row
  }

  // timingSafeEqual throws on a length mismatch, so guard before calling it.
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

// Crockford-style base32 without the characters that misread when typed from a
// phone screen: no 0/O, no 1/I/L, no U.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";

/** A fresh 16-character access code. Show it once — it is never recoverable. */
export function generateCode(length = 16): string {
  // Rejection sampling keeps the distribution uniform; a plain modulo would bias
  // toward the first 16 letters of a 30-character alphabet.
  const out: string[] = [];
  while (out.length < length) {
    for (const byte of randomBytes(length)) {
      if (byte >= 256 - (256 % ALPHABET.length)) continue;
      out.push(ALPHABET[byte % ALPHABET.length]);
      if (out.length === length) break;
    }
  }
  return out.join("");
}
