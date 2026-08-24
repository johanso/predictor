import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { profitFor } from "@/lib/betting/settle";
import { isAuthError, requireAccountApi } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

// Void = the match got postponed/cancelled, so there's no result to settle
// against — distinct from delete (which is for correcting a logging mistake).
// A voided bet keeps its row (for the monthly record) but never affects
// profit/yield: profit is fixed at 0 and it's excluded from win-rate math.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await requireAccountApi();
  if (isAuthError(account)) return account;

  const { id } = await params;
  const betId = Number(id);
  if (!Number.isInteger(betId)) {
    return NextResponse.json({ error: "Invalid bet id." }, { status: 400 });
  }

  const json = await request.json().catch(() => null);
  const parsed = z.object({ action: z.enum(["void", "won", "lost"]) }).safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body — expected { action: 'void' | 'won' | 'lost' }." },
      { status: 400 }
    );
  }

  // Scoped by accountId, not just id: bet ids are small consecutive integers, so an
  // unscoped lookup would let any logged-in account void or delete another's bets by
  // guessing. 404 rather than 403 on someone else's — it leaks nothing about which
  // ids exist.
  const bet = await prisma.bet.findFirst({ where: { id: betId, accountId: account.id } });
  if (!bet) {
    return NextResponse.json({ error: "Bet not found." }, { status: 404 });
  }
  if (bet.status !== "pending") {
    return NextResponse.json({ error: "Solo se pueden cerrar apuestas pendientes." }, { status: 422 });
  }

  const { action } = parsed.data;

  // Won/lost by hand is only for manual bets. A model bet is settled against the real
  // result the API reports, and letting it be closed by hand would make the record —
  // and the yield built on it — something other than what actually happened.
  if (action !== "void" && !bet.isManual) {
    return NextResponse.json(
      { error: "Las apuestas del modelo se liquidan solas con el resultado real. Usa 'Actualizar resultados'." },
      { status: 422 }
    );
  }

  const profit = action === "void" ? 0 : profitFor(action === "won", bet.odds, bet.stake);

  const updated = await prisma.bet.update({
    where: { id: betId },
    data: { status: action, settledAt: new Date(), profit },
  });
  return NextResponse.json({ bet: updated });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await requireAccountApi();
  if (isAuthError(account)) return account;

  const { id } = await params;
  const betId = Number(id);
  if (!Number.isInteger(betId)) {
    return NextResponse.json({ error: "Invalid bet id." }, { status: 400 });
  }

  const bet = await prisma.bet.findFirst({ where: { id: betId, accountId: account.id } });
  if (!bet) {
    return NextResponse.json({ error: "Bet not found." }, { status: 404 });
  }
  if (bet.status !== "pending") {
    return NextResponse.json({ error: "Solo se pueden borrar apuestas pendientes." }, { status: 422 });
  }

  await prisma.bet.delete({ where: { id: betId } });
  return NextResponse.json({ deleted: true });
}
