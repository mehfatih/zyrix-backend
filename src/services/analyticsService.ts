// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Analytics Service
// ─────────────────────────────────────────────────────────────

import { prisma } from "../config/database";
import { Decimal } from "@prisma/client/runtime/library";

function toNum(d: Decimal | null | undefined): number {
  return parseFloat((d ?? 0).toString());
}

function periodDays(period: string): number {
  return period === "30d" ? 30 : period === "90d" ? 90 : period === "1y" ? 365 : 7;
}

export const analyticsService = {
  async getOverview(merchantId: string) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [allTime, thisMonth, disputes, invoices] = await Promise.all([
      prisma.transaction.aggregate({
        where: { merchantId, status: "SUCCESS" },
        _sum: { amount: true },
        _count: true,
        _avg: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: { merchantId, status: "SUCCESS", createdAt: { gte: monthStart } },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.dispute.count({
        where: { merchantId, status: { in: ["OPEN", "UNDER_REVIEW"] } },
      }),
      prisma.invoice.aggregate({
        where: { merchantId, status: "PAID" },
        _sum: { total: true },
      }),
    ]);

    const totalTx = await prisma.transaction.count({ where: { merchantId } });

    return {
      totalVolume: toNum(allTime._sum.amount),
      totalTransactions: allTime._count,
      successRate:
        totalTx > 0
          ? parseFloat(((allTime._count / totalTx) * 100).toFixed(1))
          : 0,
      avgTransactionValue: toNum(allTime._avg.amount),
      monthlyVolume: toNum(thisMonth._sum.amount),
      monthlyTransactions: thisMonth._count,
      openDisputes: disputes,
      paidInvoicesTotal: toNum(invoices._sum.total),
    };
  },

  async getVolume(merchantId: string, period: string) {
    const days = periodDays(period);
    const start = new Date();
    start.setDate(start.getDate() - days);
    start.setHours(0, 0, 0, 0);

    const transactions = await prisma.transaction.findMany({
      where: {
        merchantId,
        status: "SUCCESS",
        createdAt: { gte: start },
      },
      select: { amount: true, createdAt: true },
    });

    const buckets = new Map<string, number>();
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      buckets.set(d.toISOString().slice(0, 10), 0);
    }

    for (const tx of transactions) {
      const key = tx.createdAt.toISOString().slice(0, 10);
      buckets.set(key, (buckets.get(key) ?? 0) + toNum(tx.amount));
    }

    let groupSize = 1;
    if (days === 90) groupSize = 7;
    else if (days === 365) groupSize = 30;

    const entries = Array.from(buckets.entries());
    const result: { label: string; value: number }[] = [];

    for (let i = 0; i < entries.length; i += groupSize) {
      const chunk = entries.slice(i, i + groupSize);
      const total = chunk.reduce((s, [, v]) => s + v, 0);
      const d = new Date(chunk[0][0]);

      let label: string;
      if (days === 7) label = d.toLocaleDateString("en-US", { weekday: "short" });
      else if (days <= 30) label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      else if (days === 90) label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      else label = d.toLocaleDateString("en-US", { month: "short" });

      result.push({ label, value: parseFloat(total.toFixed(2)) });
    }

    return result;
  },

  async getMethods(merchantId: string) {
    const counts = await prisma.transaction.groupBy({
      by: ["method"],
      where: { merchantId, status: "SUCCESS" },
      _count: { method: true },
    });

    const total = counts.reduce((s, c) => s + c._count.method, 0);
    if (total === 0) {
      return {
        CREDIT_CARD: 0,
        BANK_TRANSFER: 0,
        DIGITAL_WALLET: 0,
        CRYPTO: 0,
      };
    }

    return counts.reduce(
      (acc, c) => ({
        ...acc,
        [c.method]: parseFloat(((c._count.method / total) * 100).toFixed(1)),
      }),
      {} as Record<string, number>
    );
  },

  async getCountries(merchantId: string) {
    const counts = await prisma.transaction.groupBy({
      by: ["country"],
      where: { merchantId, status: "SUCCESS" },
      _count: { country: true },
      orderBy: { _count: { country: "desc" } },
      take: 10,
    });

    const total = counts.reduce((s, c) => s + c._count.country, 0);
    if (total === 0) return {};

    return counts.reduce(
      (acc, c) => ({
        ...acc,
        [c.country]: parseFloat(((c._count.country / total) * 100).toFixed(1)),
      }),
      {} as Record<string, number>
    );
  },

  async getTrends(merchantId: string) {
    const now = new Date();
    const currentStart = new Date(now);
    currentStart.setDate(currentStart.getDate() - 30);
    const prevStart = new Date(now);
    prevStart.setDate(prevStart.getDate() - 60);

    const [current, previous] = await Promise.all([
      prisma.transaction.aggregate({
        where: { merchantId, status: "SUCCESS", createdAt: { gte: currentStart } },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.transaction.aggregate({
        where: {
          merchantId,
          status: "SUCCESS",
          createdAt: { gte: prevStart, lt: currentStart },
        },
        _sum: { amount: true },
        _count: true,
      }),
    ]);

    function growth(curr: number, prev: number): number {
      if (prev === 0) return curr > 0 ? 100 : 0;
      return parseFloat((((curr - prev) / prev) * 100).toFixed(1));
    }

    const currVol = toNum(current._sum.amount);
    const prevVol = toNum(previous._sum.amount);

    return {
      volumeGrowth: growth(currVol, prevVol),
      transactionGrowth: growth(current._count, previous._count),
      currentPeriod: { volume: currVol, transactions: current._count },
      previousPeriod: { volume: prevVol, transactions: previous._count },
    };
  },
};
