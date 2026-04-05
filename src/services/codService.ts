// ─────────────────────────────────────────────────────────────
// Zyrix Backend — COD Service
// ─────────────────────────────────────────────────────────────
import { prisma } from "../config/database";
import { Decimal } from "@prisma/client/runtime/library";

function toNum(d: Decimal | null | undefined): number {
  return parseFloat((d ?? 0).toString());
}

export const codService = {
  async list(merchantId: string, filters: { status?: string }) {
    const where: any = { merchantId };
    if (filters.status) where.status = filters.status;

    const orders = await prisma.cODOrder.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return orders.map((o) => ({
      ...o,
      amount: toNum(o.amount),
      collectedAmount: toNum(o.collectedAmount),
    }));
  },

  async create(
    merchantId: string,
    data: {
      customerName: string;
      amount: number;
      currency: string;
      address: string;
      phone?: string;
      description?: string;
    }
  ) {
    const orderId = `COD-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    const order = await prisma.cODOrder.create({
      data: {
        merchantId,
        orderId,
        customerName: data.customerName,
        amount: new Decimal(data.amount),
        currency: data.currency,
        address: data.address,
        phone: data.phone,
        description: data.description,
        status: "PENDING",
      },
    });

    return { ...order, amount: toNum(order.amount), collectedAmount: toNum(order.collectedAmount) };
  },

  async markCollected(
    merchantId: string,
    id: string,
    data: { collectedAmount?: number; notes?: string }
  ) {
    const order = await prisma.cODOrder.findFirst({
      where: { id, merchantId },
    });
    if (!order) return null;

    const updated = await prisma.cODOrder.update({
      where: { id },
      data: {
        status: "COLLECTED",
        collectedAmount: new Decimal(data.collectedAmount ?? toNum(order.amount)),
        collectedAt: new Date(),
        notes: data.notes,
      },
    });

    return { ...updated, amount: toNum(updated.amount), collectedAmount: toNum(updated.collectedAmount) };
  },

  async summary(merchantId: string) {
    const [all, collected, pending] = await Promise.all([
      prisma.cODOrder.findMany({ where: { merchantId } }),
      prisma.cODOrder.findMany({ where: { merchantId, status: "COLLECTED" } }),
      prisma.cODOrder.findMany({ where: { merchantId, status: "PENDING" } }),
    ]);

    const totalCollected = collected.reduce((sum, o) => sum + toNum(o.collectedAmount), 0);
    const totalPending = pending.reduce((sum, o) => sum + toNum(o.amount), 0);

    return {
      totalOrders: all.length,
      collectedOrders: collected.length,
      pendingOrders: pending.length,
      totalCollected,
      totalPending,
    };
  },
};
