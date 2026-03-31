// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Transactions Service
// ─────────────────────────────────────────────────────────────

import { prisma } from "../config/database";
import { Prisma } from "@prisma/client";
import { TransactionFilters } from "../utils/filters";
import { PaginationParams } from "../utils/pagination";
import { Decimal } from "@prisma/client/runtime/library";

function toNum(d: Decimal | null | undefined): number {
  return parseFloat((d ?? 0).toString());
}

function buildWhere(
  merchantId: string,
  filters: TransactionFilters
): Prisma.TransactionWhereInput {
  const where: Prisma.TransactionWhereInput = { merchantId };

  if (filters.status) where.status = filters.status;
  if (filters.method) where.method = filters.method;

  if (filters.from || filters.to) {
    where.createdAt = {};
    if (filters.from) where.createdAt.gte = filters.from;
    if (filters.to) where.createdAt.lte = filters.to;
  }

  if (filters.search) {
    where.OR = [
      { customerName: { contains: filters.search, mode: "insensitive" } },
      { transactionId: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  return where;
}

const txSelect = {
  id: true,
  transactionId: true,
  amount: true,
  currency: true,
  status: true,
  method: true,
  customerName: true,
  customerEmail: true,
  customerPhone: true,
  country: true,
  flag: true,
  isCredit: true,
  description: true,
  createdAt: true,
};

export const transactionsService = {
  async list(
    merchantId: string,
    filters: TransactionFilters,
    pagination: PaginationParams
  ) {
    const where = buildWhere(merchantId, filters);
    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        select: txSelect,
        orderBy: { createdAt: "desc" },
        skip: pagination.skip,
        take: pagination.limit,
      }),
      prisma.transaction.count({ where }),
    ]);

    return {
      data: transactions.map((t) => ({ ...t, amount: toNum(t.amount) })),
      total,
    };
  },

  async getById(merchantId: string, id: string) {
    return prisma.transaction.findFirst({
      where: { id, merchantId },
      include: {
        disputes: {
          select: {
            id: true,
            disputeId: true,
            reason: true,
            amount: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });
  },

  async getStats(merchantId: string) {
    const [all, success] = await Promise.all([
      prisma.transaction.aggregate({
        where: { merchantId },
        _count: true,
        _sum: { amount: true },
        _avg: { amount: true },
      }),
      prisma.transaction.count({ where: { merchantId, status: "SUCCESS" } }),
    ]);

    const totalCount = all._count;
    const successRate =
      totalCount > 0 ? parseFloat(((success / totalCount) * 100).toFixed(1)) : 0;

    return {
      totalVolume: toNum(all._sum.amount),
      totalCount,
      successRate,
      avgAmount: toNum(all._avg.amount),
    };
  },

  async exportCsv(merchantId: string, filters: TransactionFilters): Promise<string> {
    const where = buildWhere(merchantId, filters);
    const transactions = await prisma.transaction.findMany({
      where,
      select: txSelect,
      orderBy: { createdAt: "desc" },
      take: 10000,
    });

    const header =
      "Transaction ID,Customer,Amount,Currency,Status,Method,Country,Date\n";
    const rows = transactions
      .map(
        (t) =>
          `${t.transactionId},"${t.customerName}",${toNum(t.amount)},${t.currency},${t.status},${t.method},${t.country},${t.createdAt.toISOString()}`
      )
      .join("\n");

    return header + rows;
  },
};
