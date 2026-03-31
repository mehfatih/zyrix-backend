// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Expenses Service
// ─────────────────────────────────────────────────────────────

import { prisma } from "../config/database";
import { Decimal } from "@prisma/client/runtime/library";

function toNum(d: Decimal | null | undefined): number {
  return parseFloat((d ?? 0).toString());
}

const expenseSelect = {
  id: true,
  category: true,
  description: true,
  amount: true,
  currency: true,
  date: true,
  createdAt: true,
};

export const expensesService = {
  async list(
    merchantId: string,
    filters: { category?: string; from?: Date; to?: Date },
    pagination: { skip: number; limit: number }
  ) {
    const where: Record<string, unknown> = { merchantId };
    if (filters.category) where.category = { contains: filters.category, mode: "insensitive" };
    if (filters.from || filters.to) {
      where.date = {
        ...(filters.from ? { gte: filters.from } : {}),
        ...(filters.to ? { lte: filters.to } : {}),
      };
    }

    const [expenses, total] = await Promise.all([
      prisma.expense.findMany({
        where,
        select: expenseSelect,
        orderBy: { date: "desc" },
        skip: pagination.skip,
        take: pagination.limit,
      }),
      prisma.expense.count({ where }),
    ]);

    return {
      data: expenses.map((e) => ({ ...e, amount: toNum(e.amount) })),
      total,
    };
  },

  async create(
    merchantId: string,
    body: { category: string; description: string; amount: number; currency: string; date: string }
  ) {
    const exp = await prisma.expense.create({
      data: {
        merchantId,
        category: body.category.toLowerCase(),
        description: body.description,
        amount: body.amount,
        currency: body.currency.toUpperCase(),
        date: new Date(body.date),
      },
      select: expenseSelect,
    });
    return { ...exp, amount: toNum(exp.amount) };
  },

  async update(
    merchantId: string,
    id: string,
    body: Partial<{ category: string; description: string; amount: number; currency: string; date: string }>
  ) {
    const exp = await prisma.expense.findFirst({ where: { id, merchantId } });
    if (!exp) return null;

    const updated = await prisma.expense.update({
      where: { id },
      data: {
        ...(body.category && { category: body.category.toLowerCase() }),
        ...(body.description && { description: body.description }),
        ...(body.amount !== undefined && { amount: body.amount }),
        ...(body.currency && { currency: body.currency.toUpperCase() }),
        ...(body.date && { date: new Date(body.date) }),
      },
      select: expenseSelect,
    });
    return { ...updated, amount: toNum(updated.amount) };
  },

  async delete(merchantId: string, id: string) {
    const exp = await prisma.expense.findFirst({ where: { id, merchantId } });
    if (!exp) return null;
    await prisma.expense.delete({ where: { id } });
    return { deleted: true };
  },

  async summary(merchantId: string) {
    const expenses = await prisma.expense.findMany({
      where: { merchantId },
      select: { category: true, amount: true, date: true },
    });

    const byCategory: Record<string, number> = {};
    let total = 0;

    for (const e of expenses) {
      const amt = toNum(e.amount);
      byCategory[e.category] = (byCategory[e.category] ?? 0) + amt;
      total += amt;
    }

    // Monthly avg: total / distinct months
    const months = new Set(
      expenses.map((e) => `${e.date.getFullYear()}-${e.date.getMonth()}`)
    );
    const monthlyAvg = months.size > 0 ? total / months.size : 0;

    return {
      byCategory,
      total: parseFloat(total.toFixed(2)),
      monthlyAvg: parseFloat(monthlyAvg.toFixed(2)),
    };
  },
};
