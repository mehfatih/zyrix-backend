// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Admin Disputes Service
// ─────────────────────────────────────────────────────────────
import { prisma } from "../../config/database";
import { PaginationParams } from "../../utils/pagination";
import { DisputeStatus, Prisma } from "@prisma/client";

export const adminDisputesService = {
  async list(pagination: PaginationParams, status?: string) {
    const where: Prisma.DisputeWhereInput = status
      ? { status: status as DisputeStatus }
      : {};

    const [disputes, total] = await Promise.all([
      prisma.dispute.findMany({
        where,
        select: {
          id: true,
          disputeId: true,
          reason: true,
          amount: true,
          currency: true,
          status: true,
          resolution: true,
          createdAt: true,
          resolvedAt: true,
          merchant: { select: { id: true, merchantId: true, name: true } },
          transaction: { select: { transactionId: true, customerName: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: pagination.skip,
        take: pagination.limit,
      }),
      prisma.dispute.count({ where }),
    ]);

    return {
      data: disputes.map((d) => ({
        ...d,
        amount: parseFloat(d.amount.toString()),
      })),
      total,
    };
  },

  async update(
    id: string,
    body: { status?: DisputeStatus; resolution?: string }
  ) {
    const data: Prisma.DisputeUpdateInput = {};
    if (body.status) data.status = body.status;
    if (body.resolution) data.resolution = body.resolution;
    if (body.status === "RESOLVED") data.resolvedAt = new Date();

    return prisma.dispute.update({
      where: { id },
      data,
      select: {
        id: true,
        disputeId: true,
        status: true,
        resolution: true,
        resolvedAt: true,
      },
    });
  },
};
