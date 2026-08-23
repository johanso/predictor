import { NextResponse } from "next/server";
import { z } from "zod";
import { getBankrollStatus, setStartingBalance } from "@/lib/betting/stats";

export async function GET() {
  const status = await getBankrollStatus();
  return NextResponse.json(status);
}

const bodySchema = z.object({ startingBalance: z.number().gte(0) });

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body", issues: parsed.error.issues }, { status: 400 });
  }

  await setStartingBalance(parsed.data.startingBalance);
  const status = await getBankrollStatus();
  return NextResponse.json(status);
}
