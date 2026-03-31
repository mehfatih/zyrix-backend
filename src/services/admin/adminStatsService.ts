// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Admin System Stats Service
// ─────────────────────────────────────────────────────────────

import { prisma } from "../../config/database";

export const adminStatsService = {
  async getSystemStats() {
    const [
      totalMerchants, activeMerchants, suspendedMerchants,
      txStats, txSuccess, txPending, txFailed,
      openDisputes, settlementsStats,
      recentMerchants,
    ] = await Promise.all([
      prisma.merchant.count(),
      prisma.merchant.count({ where: { status: "ACTIVE" } }),
      prisma.merchant.count({ where: { status: "SUSPENDED" } }),
      prisma.transaction.aggregate({ _count: true, _sum: { amount: true } }),
      prisma.transaction.count({ where: { status: "SUCCESS" } }),
      prisma.transaction.count({ where: { status: "PENDING" } }),
      prisma.transaction.count({ where: { status: "FAILED" } }),
      prisma.dispute.count({ where: { status: { in: ["OPEN", "UNDER_REVIEW"] } } }),
      prisma.settlement.aggregate({ _count: true, _sum: { netAmount: true } }),
      prisma.merchant.findMany({
        take: 5,
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true, merchantId: true, country: true, createdAt: true, status: true },
      }),
    ]);

    const totalTx = txStats._count;
    return {
      merchants: {
        total: totalMerchants,
        active: activeMerchants,
        suspended: suspendedMerchants,
        pendingKyc: totalMerchants - activeMerchants - suspendedMerchants,
      },
      transactions: {
        total: totalTx,
        totalVolume: parseFloat((txStats._sum.amount ?? 0).toString()),
        success: txSuccess,
        pending: txPending,
        failed: txFailed,
        successRate: totalTx > 0 ? parseFloat(((txSuccess / totalTx) * 100).toFixed(1)) : 0,
      },
      disputes: { open: openDisputes },
      settlements: {
        total: settlementsStats._count,
        totalNetAmount: parseFloat((settlementsStats._sum.netAmount ?? 0).toString()),
      },
      recentMerchants,
    };
  },
};
