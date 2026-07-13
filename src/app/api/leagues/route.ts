import { NextResponse } from "next/server";
import { COMPETITIONS } from "@/lib/footballData/competitions";

export function GET() {
  return NextResponse.json({ leagues: COMPETITIONS });
}
