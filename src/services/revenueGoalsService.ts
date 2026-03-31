// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Revenue Goals Service
// ─────────────────────────────────────────────────────────────

import { prisma } from "../config/database";
import { Decimal } from "@prisma/client/runtime/library";
import { GoalPeriod } from "@prisma/client";

function toNum(d: Decimal | null | undefined): number {
  return parseFloat((d ?? 0).toString());
}

const goalSelect = {
  id: true,
  name: true,
  targetAmount: true,
  currentAmount: true,
  currency: true,
  period: true,
  startDate: true,
  endDate: true,
  createdAt: true,
};

export const revenueGoalsService = {
  async list(merchantId: string, pagination: { skip: number; limit: number }) {
    const [goals, total] = await Promise.all([
      prisma.revenueGoal.findMany({
        where: { merchantId },
        select: goalSelect,
        orderBy: { createdAt: "desc" },
        skip: pagination.skip,
        take: pagination.limit,
      }),
      prisma.revenueGoal.count({ where: { merchantId } }),
    ]);

    return {
      data: goals.map((g) => ({
        ...g,
        targetAmount: toNum(g.targetAmount),
        currentAmount: toNum(g.currentAmount),
        progressPercent: parseFloat(
          (g.targetAmount > 0
            ? (toNum(g.currentAmount) / toNum(g.targetAmount)) * 100
            : 0
          ).toFixed(1)
        ),
      })),
      total,
    };
  },

  async create(
    merchantId: string,
    body: {
      name: string;
      targetAmount: number;
      currency: string;
      period: string;
      startDate: string;
      endDate: string;
    }
  ) {
    const goal = await prisma.revenueGoal.create({
      data: {
        merchantId,
        name: body.name,
        targetAmount: body.targetAmount,
        currency: body.currency.toUpperCase(),
        period: body.period.toUpperCase() as GoalPeriod,
        startDate: new Date(body.startDate),
        endDate: new Date(body.endDate),
      },
      select: goalSelect,
    });
    return {
      ...goal,
      targetAmount: toNum(goal.targetAmount),
      currentAmount: toNum(goal.currentAmount),
      progressPercent: 0,
    };
  },

  async update(
    merchantId: string,
    id: string,
    body: Partial<{
      name: string;
      targetAmount: number;
      currency: string;
      period: string;
      startDate: string;
      endDate: string;
    }>
  ) {
    const goal = await prisma.revenueGoal.findFirst({ where: { id, merchantId } });
    if (!goal) return null;

    const updated = await prisma.revenueGoal.update({
      where: { id },
      data: {
        ...(body.name && { name: body.name }),
        ...(body.targetAmount !== undefined && { targetAmount: body.targetAmount }),
        ...(body.currency && { currency: body.currency.toUpperCase() }),
        ...(body.period && { period: body.period.toUpperCase() as GoalPeriod }),
        ...(body.startDate && { startDate: new Date(body.startDate) }),
        ...(body.endDate && { endDate: new Date(body.endDate) }),
      },
      select: goalSelect,
    });

    const target = toNum(updated.targetAmount);
    const current = toNum(updated.currentAmount);

    return {
      ...updated,
      targetAmount: target,
      currentAmount: current,
      progressPercent: parseFloat(
        (target > 0 ? (current / target) * 100 : 0).toFixed(1)
      ),
    };
  },

  async delete(merchantId: string, id: string) {
    const goal = await prisma.revenueGoal.findFirst({ where: { id, merchantId } });
    if (!goal) return null;
    await prisma.revenueGoal.delete({ where: { id } });
    return { deleted: true };
  },
};
