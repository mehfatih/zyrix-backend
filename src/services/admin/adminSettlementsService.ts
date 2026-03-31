// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Admin Settlements Service
// ─────────────────────────────────────────────────────────────

import { prisma } from "../../config/database";
import { PaginationParams } from "../../utils/pagination";
import { SettlementStatus } from "@prisma/client";

export const adminSettlementsService = {
  async list(pagination: PaginationParams, status?: string) {
    const where = status ? { status: status as SettlementStatus } : {};
    const [settlements, total] = await Promise.all([
      prisma.settlement.findMany({
        where,
        select: {
          id: true, settlementId: true, amount: true, commission: true,
          netAmount: true, currency: true, status: true,
          bankName: true, bankAccount: true, scheduledDate: true,
          completedDate: true, createdAt: true,
          merchant: { select: { id: true, merchantId: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: pagination.skip,
        take: pagination.limit,
      }),
      prisma.settlement.count({ where }),
    ]);

    return {
      data: settlements.map((s) => ({
        ...s,
        amount: parseFloat(s.amount.toString()),
        commission: parseFloat(s.commission.toString()),
        netAmount: parseFloat(s.netAmount.toString()),
      })),
      total,
    };
  },
};
