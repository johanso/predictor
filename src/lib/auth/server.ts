// Server-side account resolution. src/proxy.ts is the coarse gate; these are the
// actual enforcement — every scoped route calls one even though the proxy already
// ran, because a typo in a matcher regex must not be the only thing between the
// internet and the owner's data.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";

export interface CurrentAccount {
  id: number;
  name: string;
}

/** The logged-in account, or null. Never throws. */
export async function getAccount(): Promise<CurrentAccount | null> {
  const store = await cookies();
  const payload = verifySessionToken(store.get(SESSION_COOKIE)?.value);
  return payload ? { id: payload.aid, name: payload.name } : null;
}

/** For server components. Sends the browser to the login page when logged out. */
export async function requireAccount(): Promise<CurrentAccount> {
  const account = await getAccount();
  if (!account) redirect("/login");
  return account;
}

/**
 * For route handlers. Returns a 401 the caller should return immediately —
 * redirect() from a handler produces a 307 to an HTML page, which hands fetch()
 * callers a login form and an "Unexpected token <" in the console.
 */
export async function requireAccountApi(): Promise<CurrentAccount | NextResponse> {
  const account = await getAccount();
  return account ?? NextResponse.json({ error: "No autenticado." }, { status: 401 });
}

export function isAuthError(value: CurrentAccount | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}
