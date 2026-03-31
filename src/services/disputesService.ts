import { prisma } from "../config/database";
import { Decimal } from "@prisma/client/runtime/library";
import { Prisma } from "@prisma/client";

function toNum(d: Decimal | null | undefined): number {
  return parseFloat((d ?? 0).toString());
}

const disputeSelect = {
  id: true, disputeId: true, transactionId: true, reason: true,
  amount: true, currency: true, status: true, resolution: true,
  evidence: true, createdAt: true, resolvedAt: true,
  transaction: {
    select: { transactionId: true, customerName: true, amount: true, currency: true, createdAt: true },
  },
};

export const disputesService = {
  async list(merchantId: string, filters: { status?: string }, pagination: { skip: number; limit: number }) {
    const where: Prisma.DisputeWhereInput = { merchantId };
    if (filters.status) where.status = filters.status as Prisma.EnumDisputeStatusFilter;
    const [disputes, total] = await Promise.all([
      prisma.dispute.findMany({ where, select: disputeSelect, orderBy: { createdAt: "desc" }, skip: pagination.skip, take: pagination.limit }),
      prisma.dispute.count({ where }),
    ]);
    return { data: disputes.map((d) => ({ ...d, amount: toNum(d.amount) })), total };
  },

  async getById(merchantId: string, id: string) {
    const d = await prisma.dispute.findFirst({ where: { id, merchantId }, select: disputeSelect });
    if (!d) return null;
    return { ...d, amount: toNum(d.amount) };
  },

  async respond(merchantId: string, id: string, body: { response: string; evidence?: Record<string, unknown> }) {
    const dispute = await prisma.dispute.findFirst({ where: { id, merchantId } });
    if (!dispute) return null;

    const evidenceData: Prisma.DisputeUpdateInput = {
      resolution: body.response,
      status: "UNDER_REVIEW",
    };

    if (body.evidence !== undefined) {
      evidenceData.evidence = body.evidence as Prisma.InputJsonValue;
    } else if (dispute.evidence !== null) {
      evidenceData.evidence = dispute.evidence as Prisma.InputJsonValue;
    }

    const updated = await prisma.dispute.update({ where: { id }, data: evidenceData, select: disputeSelect });
    return { ...updated, amount: toNum(updated.amount) };
  },
};
