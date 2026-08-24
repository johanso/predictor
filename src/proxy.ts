// Next 16 renamed Middleware to Proxy. One file per project, and it sits beside
// app/ — which lives under src/ here, so this is src/proxy.ts, not the repo root.
//
// This is the *optimistic* check the docs prescribe: signature and expiry only,
// no database. The real enforcement is requireAccount/requireAccountApi in
// src/lib/auth/server.ts, which every scoped route calls independently.
//
// It gates the whole app, not just the betting pages. /api/odds and
// /api/leagues/[code]/standings?refresh=1 spend real quota — football-data allows
// 10 requests a minute and odds-api 500 a day — so an open predictor is an open
// tap on both.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";

export function proxy(request: NextRequest) {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (session) return NextResponse.next();

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!login|api/session|_next/static|_next/image|favicon.ico).*)"],
};
