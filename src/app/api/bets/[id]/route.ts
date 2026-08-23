import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

// Void = the match got postponed/cancelled, so there's no result to settle
// against — distinct from delete (which is for correcting a logging mistake).
// A voided bet keeps its row (for the monthly record) but never affects
// profit/yield: profit is fixed at 0 and it's excluded from win-rate math.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const betId = Number(id);
  if (!Number.isInteger(betId)) {
    return NextResponse.json({ error: "Invalid bet id." }, { status: 400 });
  }

  const json = await request.json().catch(() => null);
  const parsed = z.object({ action: z.literal("void") }).safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body — expected { action: 'void' }." }, { status: 400 });
  }

  const bet = await prisma.bet.findUnique({ where: { id: betId } });
  if (!bet) {
    return NextResponse.json({ error: "Bet not found." }, { status: 404 });
  }
  if (bet.status !== "pending") {
    return NextResponse.json({ error: "Solo se pueden anular apuestas pendientes." }, { status: 422 });
  }

  const updated = await prisma.bet.update({
    where: { id: betId },
    data: { status: "void", settledAt: new Date(), profit: 0 },
  });
  return NextResponse.json({ bet: updated });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const betId = Number(id);
  if (!Number.isInteger(betId)) {
    return NextResponse.json({ error: "Invalid bet id." }, { status: 400 });
  }

  const bet = await prisma.bet.findUnique({ where: { id: betId } });
  if (!bet) {
    return NextResponse.json({ error: "Bet not found." }, { status: 404 });
  }
  if (bet.status !== "pending") {
    return NextResponse.json({ error: "Solo se pueden borrar apuestas pendientes." }, { status: 422 });
  }

  await prisma.bet.delete({ where: { id: betId } });
  return NextResponse.json({ deleted: true });
}
