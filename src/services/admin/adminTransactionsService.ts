// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Admin Transactions Service (All Merchants)
// ─────────────────────────────────────────────────────────────

import { prisma } from "../../config/database";
import { PaginationParams } from "../../utils/pagination";
import { Prisma } from "@prisma/client";

export const adminTransactionsService = {
  async list(pagination: PaginationParams, query: Record<string, unknown>) {
    const where: Prisma.TransactionWhereInput = {};
    if (query.status) where.status = query.status as any;
    if (query.method) where.method = query.method as any;
    if (query.merchantId) where.merchantId = query.merchantId as string;
    if (query.search) {
      where.OR = [
        { customerName: { contains: query.search as string, mode: "insensitive" } },
        { transactionId: { contains: query.search as string, mode: "insensitive" } },
      ];
    }
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) (where.createdAt as any).gte = new Date(query.from as string);
      if (query.to) (where.createdAt as any).lte = new Date(query.to as string);
    }

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        select: {
          id: true, transactionId: true, amount: true, currency: true,
          status: true, method: true, customerName: true, country: true,
          flag: true, isCredit: true, createdAt: true,
          merchant: { select: { id: true, merchantId: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: pagination.skip,
        take: pagination.limit,
      }),
      prisma.transaction.count({ where }),
    ]);

    return {
      data: transactions.map((t) => ({ ...t, amount: parseFloat(t.amount.toString()) })),
      total,
    };
  },
};
