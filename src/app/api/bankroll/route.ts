import { NextResponse } from "next/server";
import { z } from "zod";
import { getBankrollStatus, setStartingBalance } from "@/lib/betting/stats";
import { isAuthError, requireAccountApi } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const account = await requireAccountApi();
  if (isAuthError(account)) return account;

  const status = await getBankrollStatus(account.id);
  return NextResponse.json(status);
}

const bodySchema = z.object({ startingBalance: z.number().gte(0) });

export async function POST(request: Request) {
  const account = await requireAccountApi();
  if (isAuthError(account)) return account;

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body", issues: parsed.error.issues }, { status: 400 });
  }

  await setStartingBalance(account.id, parsed.data.startingBalance);
  const status = await getBankrollStatus(account.id);
  return NextResponse.json(status);
}
