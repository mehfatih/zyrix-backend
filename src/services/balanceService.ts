// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Balance Service
// ─────────────────────────────────────────────────────────────

import { prisma } from "../config/database";
import { Decimal } from "@prisma/client/runtime/library";

function toNum(d: Decimal | null | undefined): number {
  return parseFloat((d ?? 0).toString());
}

export const balanceService = {
  async getBalance(merchantId: string) {
    const [successTx, incomingSettlements, outgoingSettlements, nextSettlement] =
      await Promise.all([
        prisma.transaction.aggregate({
          where: { merchantId, status: "SUCCESS" },
          _sum: { amount: true },
        }),
        prisma.settlement.aggregate({
          where: { merchantId, status: "SCHEDULED" },
          _sum: { netAmount: true },
        }),
        prisma.settlement.aggregate({
          where: { merchantId, status: { in: ["PROCESSING", "COMPLETED"] } },
          _sum: { netAmount: true },
        }),
        prisma.settlement.findFirst({
          where: { merchantId, status: "SCHEDULED" },
          orderBy: { scheduledDate: "asc" },
          select: {
            scheduledDate: true,
            amount: true,
            commission: true,
            netAmount: true,
          },
        }),
      ]);

    const totalVolume = toNum(successTx._sum.amount);
    const incoming = toNum(incomingSettlements._sum.netAmount);
    const outgoing = toNum(outgoingSettlements._sum.netAmount);
    const available = parseFloat((totalVolume - outgoing).toFixed(2));

    const next = nextSettlement
      ? {
          date: nextSettlement.scheduledDate.toISOString().slice(0, 10),
          amount: toNum(nextSettlement.amount),
          commission: toNum(nextSettlement.commission),
          netAmount: toNum(nextSettlement.netAmount),
          dateAmount: toNum(nextSettlement.netAmount),
        }
      : null;

    return { available, incoming, outgoing, nextSettlement: next };
  },

  async getHistory(merchantId: string, period: string) {
    const days = period === "90d" ? 90 : period === "7d" ? 7 : 30;
    const start = new Date();
    start.setDate(start.getDate() - days);
    start.setHours(0, 0, 0, 0);

    const transactions = await prisma.transaction.findMany({
      where: {
        merchantId,
        status: "SUCCESS",
        createdAt: { gte: start },
      },
      select: { amount: true, createdAt: true, isCredit: true },
      orderBy: { createdAt: "asc" },
    });

    const buckets = new Map<
      string,
      { incoming: number; outgoing: number }
    >();

    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      buckets.set(d.toISOString().slice(0, 10), { incoming: 0, outgoing: 0 });
    }

    for (const tx of transactions) {
      const key = tx.createdAt.toISOString().slice(0, 10);
      const bucket = buckets.get(key) ?? { incoming: 0, outgoing: 0 };
      const amt = toNum(tx.amount);
      if (tx.isCredit) bucket.incoming += amt;
      else bucket.outgoing += amt;
      buckets.set(key, bucket);
    }

    let runningBalance = 0;
    const history = Array.from(buckets.entries()).map(([date, b]) => {
      runningBalance += b.incoming - b.outgoing;
      return {
        date,
        available: parseFloat(runningBalance.toFixed(2)),
        incoming: parseFloat(b.incoming.toFixed(2)),
        outgoing: parseFloat(b.outgoing.toFixed(2)),
      };
    });

    return history;
  },
};
