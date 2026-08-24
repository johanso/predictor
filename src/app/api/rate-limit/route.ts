import { NextResponse } from "next/server";
import { getRateLimitStatus } from "@/lib/footballData/rateLimiter";

export async function GET() {
  return NextResponse.json(await getRateLimitStatus());
}

export const dynamic = "force-dynamic";
