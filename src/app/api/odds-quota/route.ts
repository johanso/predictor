import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { getOddsQuota } from "@/lib/oddsApi/quota";

export async function GET() {
  if (!config.oddsApi.isConfigured) {
    return NextResponse.json({ configured: false });
  }
  return NextResponse.json({ configured: true, ...(await getOddsQuota()) });
}

export const dynamic = "force-dynamic";
