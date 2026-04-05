// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Refunds Service
// ─────────────────────────────────────────────────────────────
import { prisma } from "../config/database";
import { Decimal } from "@prisma/client/runtime/library";
import { Prisma } from "@prisma/client";

function toNum(d: Decimal | null | undefined): number {
  return parseFloat((d ?? 0).toString());
}

const refundSelect = {
  id: true,
  refundId: true,
  transactionId: true,
  amount: true,
  currency: true,
  reason: true,
  status: true,
  createdAt: true,
  completedAt: true,
  transaction: {
    select: {
      transactionId: true,
      customerName: true,
      amount: true,
      currency: true,
      createdAt: true,
    },
  },
};

export const refundsService = {
  async list(
    merchantId: string,
    filters: { status?: string },
    pagination: { skip: number; limit: number }
  ) {
    const where: Prisma.RefundWhereInput = { merchantId };
    if (filters.status) {
      where.status = filters.status as Prisma.EnumRefundStatusFilter;
    }
    const [refunds, total] = await Promise.all([
      prisma.refund.findMany({
        where,
        select: refundSelect,
        orderBy: { createdAt: "desc" },
        skip: pagination.skip,
        take: pagination.limit,
      }),
      prisma.refund.count({ where }),
    ]);
    return {
      data: refunds.map((r) => ({ ...r, amount: toNum(r.amount) })),
      total,
    };
  },

  async getById(merchantId: string, id: string) {
    const refund = await prisma.refund.findFirst({
      where: { id, merchantId },
      select: refundSelect,
    });
    if (!refund) return null;
    return { ...refund, amount: toNum(refund.amount) };
  },

  async create(
    merchantId: string,
    data: { transactionId: string; amount: number; reason: string }
  ) {
    // Verify transaction belongs to this merchant
    const transaction = await prisma.transaction.findFirst({
      where: { id: data.transactionId, merchantId, status: "SUCCESS" },
      select: { id: true, currency: true, amount: true },
    });
    if (!transaction) return null;

    // Generate refund ID
    const refundId = `RFD-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    const refund = await prisma.refund.create({
      data: {
        refundId,
        merchantId,
        transactionId: data.transactionId,
        amount: new Decimal(data.amount),
        currency: transaction.currency,
        reason: data.reason,
        status: "PROCESSING",
      },
      select: refundSelect,
    });

    return { ...refund, amount: toNum(refund.amount) };
  },
};
