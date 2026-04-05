// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Transfers Service
// ─────────────────────────────────────────────────────────────
import { prisma } from "../config/database";
import { Decimal } from "@prisma/client/runtime/library";

function toNum(d: Decimal | null | undefined): number {
  return parseFloat((d ?? 0).toString());
}

export const transfersService = {
  async list(merchantId: string) {
    const [sent, received] = await Promise.all([
      prisma.transfer.findMany({
        where: { fromMerchantId: merchantId },
        orderBy: { createdAt: "desc" },
        include: {
          toMerchant: {
            select: { merchantId: true, name: true },
          },
        },
      }),
      prisma.transfer.findMany({
        where: { toMerchantId: merchantId },
        orderBy: { createdAt: "desc" },
        include: {
          fromMerchant: {
            select: { merchantId: true, name: true },
          },
        },
      }),
    ]);

    return {
      sent: sent.map((t) => ({ ...t, amount: toNum(t.amount) })),
      received: received.map((t) => ({ ...t, amount: toNum(t.amount) })),
    };
  },

  async create(
    fromMerchantId: string,
    data: { toMerchantId: string; amount: number; description?: string }
  ) {
    const toMerchant = await prisma.merchant.findUnique({
      where: { merchantId: data.toMerchantId },
      select: { id: true },
    });
    if (!toMerchant) return null;

    const transferId = `TRF-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    const transfer = await prisma.transfer.create({
      data: {
        transferId,
        fromMerchantId,
        toMerchantId: toMerchant.id,
        amount: new Decimal(data.amount),
        currency: "SAR",
        description: data.description,
        status: "COMPLETED",
        completedAt: new Date(),
      },
      include: {
        toMerchant: {
          select: { merchantId: true, name: true },
        },
      },
    });

    return { ...transfer, amount: toNum(transfer.amount) };
  },
};
