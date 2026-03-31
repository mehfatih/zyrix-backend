// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Dashboard Service
// ─────────────────────────────────────────────────────────────

import { prisma } from "../config/database";
import { Decimal } from "@prisma/client/runtime/library";

function toNum(d: Decimal | null | undefined): number {
  return parseFloat((d ?? 0).toString());
}

export const dashboardService = {
  async getDashboard(merchantId: string) {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    // KPIs
    const [successTx, allTx, todayTx, openDisputes] = await Promise.all([
      prisma.transaction.aggregate({
        where: { merchantId, status: "SUCCESS" },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.transaction.count({ where: { merchantId } }),
      prisma.transaction.count({
        where: { merchantId, createdAt: { gte: todayStart } },
      }),
      prisma.dispute.count({
        where: { merchantId, status: { in: ["OPEN", "UNDER_REVIEW"] } },
      }),
    ]);

    const totalVolume = toNum(successTx._sum.amount);
    const successCount = successTx._count;
    const successRate = allTx > 0 ? ((successCount / allTx) * 100).toFixed(1) : "0.0";

    // Recent transactions
    const recentTransactions = await prisma.transaction.findMany({
      where: { merchantId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        transactionId: true,
        amount: true,
        currency: true,
        status: true,
        method: true,
        customerName: true,
        country: true,
        flag: true,
        isCredit: true,
        createdAt: true,
      },
    });

    // Balance from settlements
    const [incoming, outgoing] = await Promise.all([
      prisma.settlement.aggregate({
        where: { merchantId, status: "SCHEDULED" },
        _sum: { netAmount: true },
      }),
      prisma.settlement.aggregate({
        where: { merchantId, status: { in: ["PROCESSING", "COMPLETED"] } },
        _sum: { netAmount: true },
      }),
    ]);

    const incomingAmount = toNum(incoming._sum.netAmount);
    const outgoingAmount = toNum(outgoing._sum.netAmount);
    const available = totalVolume - outgoingAmount;

    // Unread notifications
    const unreadNotifications = await prisma.notification.count({
      where: { merchantId, isRead: false },
    });

    return {
      kpis: {
        totalVolume,
        successRate,
        todayTx,
        openDisputes,
      },
      recentTransactions: recentTransactions.map((t) => ({
        ...t,
        amount: toNum(t.amount),
      })),
      balance: {
        available: parseFloat(available.toFixed(2)),
        incoming: incomingAmount,
        outgoing: outgoingAmount,
      },
      unreadNotifications,
    };
  },

  async getAnalytics(merchantId: string, period: string) {
    const days =
      period === "30d" ? 30 : period === "90d" ? 90 : period === "1y" ? 365 : 7;

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
      orderBy: { createdAt: "asc" },
    });

    // Build day-buckets
    const buckets = new Map<string, number>();
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      buckets.set(key, 0);
    }

    let totalRevenue = 0;
    for (const tx of transactions) {
      const key = tx.createdAt.toISOString().slice(0, 10);
      const amt = toNum(tx.amount);
      buckets.set(key, (buckets.get(key) ?? 0) + amt);
      totalRevenue += amt;
    }

    // Aggregate depending on period
    const volume: { label: string; value: number }[] = [];
    const revenue: { label: string; value: number }[] = [];

    let groupSize = 1;
    if (days === 30) groupSize = 1;
    else if (days === 90) groupSize = 7;
    else if (days === 365) groupSize = 30;

    const entries = Array.from(buckets.entries());
    for (let i = 0; i < entries.length; i += groupSize) {
      const chunk = entries.slice(i, i + groupSize);
      const total = chunk.reduce((s, [, v]) => s + v, 0);
      const dateStr = chunk[0][0];
      const d = new Date(dateStr);

      let label: string;
      if (days === 7) {
        label = d.toLocaleDateString("en-US", { weekday: "short" });
      } else if (days <= 30) {
        label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      } else if (days === 90) {
        label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      } else {
        label = d.toLocaleDateString("en-US", { month: "short" });
      }

      volume.push({ label, value: parseFloat(total.toFixed(2)) });
      revenue.push({ label, value: parseFloat((total * 0.97).toFixed(2)) });
    }

    const transactionCount = transactions.length;
    const avgTransactionValue =
      transactionCount > 0
        ? parseFloat((totalRevenue / transactionCount).toFixed(2))
        : 0;

    return { volume, revenue, transactionCount, avgTransactionValue };
  },
};
