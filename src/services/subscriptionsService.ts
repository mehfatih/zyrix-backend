// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Subscriptions Service
// ─────────────────────────────────────────────────────────────

import { prisma } from "../config/database";
import { Decimal } from "@prisma/client/runtime/library";
import { SubInterval, SubStatus } from "@prisma/client";

function toNum(d: Decimal | null | undefined): number {
  return parseFloat((d ?? 0).toString());
}

const subSelect = {
  id: true,
  planName: true,
  amount: true,
  currency: true,
  interval: true,
  status: true,
  currentPeriodStart: true,
  currentPeriodEnd: true,
  createdAt: true,
};

export const subscriptionsService = {
  async list(merchantId: string, pagination: { skip: number; limit: number }) {
    const [subs, total] = await Promise.all([
      prisma.subscription.findMany({
        where: { merchantId },
        select: subSelect,
        orderBy: { createdAt: "desc" },
        skip: pagination.skip,
        take: pagination.limit,
      }),
      prisma.subscription.count({ where: { merchantId } }),
    ]);
    return {
      data: subs.map((s) => ({ ...s, amount: toNum(s.amount) })),
      total,
    };
  },

  async create(
    merchantId: string,
    body: {
      planName: string;
      amount: number;
      currency: string;
      interval: string;
      currentPeriodStart: string;
      currentPeriodEnd: string;
    }
  ) {
    const sub = await prisma.subscription.create({
      data: {
        merchantId,
        planName: body.planName,
        amount: body.amount,
        currency: body.currency.toUpperCase(),
        interval: body.interval.toUpperCase() as SubInterval,
        status: "ACTIVE",
        currentPeriodStart: new Date(body.currentPeriodStart),
        currentPeriodEnd: new Date(body.currentPeriodEnd),
      },
      select: subSelect,
    });
    return { ...sub, amount: toNum(sub.amount) };
  },

  async update(
    merchantId: string,
    id: string,
    body: Partial<{
      planName: string;
      amount: number;
      currency: string;
      interval: string;
      status: string;
      currentPeriodStart: string;
      currentPeriodEnd: string;
    }>
  ) {
    const sub = await prisma.subscription.findFirst({ where: { id, merchantId } });
    if (!sub) return null;

    const updated = await prisma.subscription.update({
      where: { id },
      data: {
        ...(body.planName && { planName: body.planName }),
        ...(body.amount !== undefined && { amount: body.amount }),
        ...(body.currency && { currency: body.currency.toUpperCase() }),
        ...(body.interval && { interval: body.interval.toUpperCase() as SubInterval }),
        ...(body.status && { status: body.status.toUpperCase() as SubStatus }),
        ...(body.currentPeriodStart && { currentPeriodStart: new Date(body.currentPeriodStart) }),
        ...(body.currentPeriodEnd && { currentPeriodEnd: new Date(body.currentPeriodEnd) }),
      },
      select: subSelect,
    });
    return { ...updated, amount: toNum(updated.amount) };
  },

  async cancel(merchantId: string, id: string) {
    const sub = await prisma.subscription.findFirst({ where: { id, merchantId } });
    if (!sub) return null;

    const updated = await prisma.subscription.update({
      where: { id },
      data: { status: "CANCELLED" },
      select: subSelect,
    });
    return { ...updated, amount: toNum(updated.amount) };
  },
};
