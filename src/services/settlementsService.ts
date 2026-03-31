// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Settlements Service
// ─────────────────────────────────────────────────────────────

import { prisma } from "../config/database";
import { Decimal } from "@prisma/client/runtime/library";

function toNum(d: Decimal | null | undefined): number {
  return parseFloat((d ?? 0).toString());
}

const settlementSelect = {
  id: true,
  settlementId: true,
  amount: true,
  commission: true,
  netAmount: true,
  currency: true,
  status: true,
  bankName: true,
  bankAccount: true,
  scheduledDate: true,
  completedDate: true,
  createdAt: true,
};

export const settlementsService = {
  async list(
    merchantId: string,
    filters: { status?: string; from?: Date; to?: Date },
    pagination: { skip: number; limit: number }
  ) {
    const where: Record<string, unknown> = { merchantId };
    if (filters.status) where.status = filters.status;
    if (filters.from || filters.to) {
      where.createdAt = {
        ...(filters.from ? { gte: filters.from } : {}),
        ...(filters.to ? { lte: filters.to } : {}),
      };
    }

    const [settlements, total] = await Promise.all([
      prisma.settlement.findMany({
        where,
        select: settlementSelect,
        orderBy: { createdAt: "desc" },
        skip: pagination.skip,
        take: pagination.limit,
      }),
      prisma.settlement.count({ where }),
    ]);

    return {
      data: settlements.map((s) => ({
        ...s,
        amount: toNum(s.amount),
        commission: toNum(s.commission),
        netAmount: toNum(s.netAmount),
      })),
      total,
    };
  },

  async getById(merchantId: string, id: string) {
    const s = await prisma.settlement.findFirst({
      where: { id, merchantId },
    });
    if (!s) return null;
    return {
      ...s,
      amount: toNum(s.amount),
      commission: toNum(s.commission),
      netAmount: toNum(s.netAmount),
    };
  },

  async getUpcoming(merchantId: string) {
    const settlements = await prisma.settlement.findMany({
      where: { merchantId, status: "SCHEDULED" },
      select: settlementSelect,
      orderBy: { scheduledDate: "asc" },
    });
    return settlements.map((s) => ({
      ...s,
      amount: toNum(s.amount),
      commission: toNum(s.commission),
      netAmount: toNum(s.netAmount),
    }));
  },
};
