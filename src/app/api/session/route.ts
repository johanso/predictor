import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyCode } from "@/lib/auth/codes";
import {
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
} from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ code: z.string().min(8).max(128) });

/**
 * Log in. The code alone identifies the account — no name field, because a
 * per-account code *is* the identity and asking for both doubles the friction
 * for no security gain.
 *
 * Every account's hash is checked even after a match would have been found, so a
 * wrong code costs the same regardless of which account it was aimed at.
 */
export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Código no válido." }, { status: 400 });
  }

  const accounts = await prisma.account.findMany({ select: { id: true, name: true, codeHash: true } });

  let matched: { id: number; name: string } | null = null;
  for (const account of accounts) {
    if (await verifyCode(parsed.data.code, account.codeHash)) {
      matched = { id: account.id, name: account.name };
    }
  }

  // Deliberately generic: never distinguish "no such account" from "wrong code".
  if (!matched) {
    return NextResponse.json({ error: "Código incorrecto." }, { status: 401 });
  }

  const store = await cookies();
  store.set(SESSION_COOKIE, createSessionToken(matched), {
    ...SESSION_COOKIE_OPTIONS,
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  return NextResponse.json({ account: { name: matched.name } });
}

/** Log out — "cambiar cuenta" is the same thing from the UI's point of view. */
export async function DELETE() {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", { ...SESSION_COOKIE_OPTIONS, maxAge: 0 });
  return NextResponse.json({ ok: true });
}
