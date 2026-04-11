// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Expenses Controller (Elite)
// Auto Import + Analytics + Net Profit
// ─────────────────────────────────────────────────────────────
import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types";
import { prisma } from "../config/database";
import { parsePagination, buildMeta } from "../utils/pagination";

// ─── Types ───────────────────────────────────────────────────

interface ExpenseSumRow {
  category: string;
  total: number;
  count: number;
}

interface RevenueSumRow {
  total: number;
}

interface AnalyticsRow {
  top_category: string | null;
  total_expenses: number;
  total_revenue: number;
  net_profit: number;
  profit_margin: number;
  category_breakdown: unknown;
  calculated_at: string;
}

interface TxRow {
  id: string;
  amount: number;
  currency: string;
  description: string | null;
  created_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────

const VALID_CATEGORIES = ["rent", "salary", "supplies", "marketing", "utilities", "other"];

async function recalcAnalytics(merchantId: string): Promise<void> {
  // مجموع المصاريف حسب الفئة
  const catRows = await prisma.$queryRawUnsafe<ExpenseSumRow[]>(
    `SELECT category,
            COALESCE(SUM(amount::numeric), 0)::float AS total,
            COUNT(*)::int AS count
     FROM expenses
     WHERE merchant_id = $1
     GROUP BY category`,
    merchantId
  );

  const totalExpenses = catRows.reduce((s: number, r: ExpenseSumRow) => s + Number(r.total), 0);

  // breakdown كـ JSON { category: { total, count, percent } }
  const breakdown: Record<string, { total: number; count: number; percent: number }> = {};
  let topCategory = "";
  let topAmount = 0;

  for (const row of catRows) {
    const total = Number(row.total);
    const pct = totalExpenses > 0 ? Math.round((total / totalExpenses) * 100) : 0;
    breakdown[row.category] = { total, count: Number(row.count), percent: pct };
    if (total > topAmount) { topAmount = total; topCategory = row.category; }
  }

  // مجموع الإيرادات الفعلية (آخر 30 يوم)
  const revenueRows = await prisma.$queryRawUnsafe<RevenueSumRow[]>(
    `SELECT COALESCE(SUM(amount::numeric), 0)::float AS total
     FROM transactions
     WHERE merchant_id = $1
       AND status = 'SUCCESS'
       AND is_credit = TRUE
       AND created_at >= NOW() - INTERVAL '30 days'`,
    merchantId
  );
  const totalRevenue = Number(revenueRows[0]?.total ?? 0);
  const netProfit = totalRevenue - totalExpenses;
  const profitMargin = totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 100) : 0;

  await prisma.$executeRawUnsafe(
    `INSERT INTO expense_analytics
       (merchant_id, top_category, total_expenses, total_revenue, net_profit, profit_margin, category_breakdown, period_start, period_end)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW() - INTERVAL '30 days', NOW())
     ON CONFLICT (merchant_id) DO UPDATE
       SET top_category = $2, total_expenses = $3, total_revenue = $4,
           net_profit = $5, profit_margin = $6, category_breakdown = $7::jsonb,
           period_start = NOW() - INTERVAL '30 days', period_end = NOW(), calculated_at = NOW()`,
    merchantId,
    topCategory || null,
    totalExpenses,
    totalRevenue,
    netProfit,
    profitMargin,
    JSON.stringify(breakdown)
  );
}

// ─── Controller ──────────────────────────────────────────────

export const expensesController = {
  // ─── List ────────────────────────────────────────
  async list(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const merchantId = req.merchant.id;
      const pagination = parsePagination(
        req.query.page as string,
        req.query.limit as string
      );

      const filters: { category?: string; from?: Date; to?: Date } = {};
      if (req.query.category && typeof req.query.category === "string")
        filters.category = req.query.category;
      if (req.query.from && typeof req.query.from === "string") {
        const d = new Date(req.query.from);
        if (!isNaN(d.getTime())) filters.from = d;
      }
      if (req.query.to && typeof req.query.to === "string") {
        const d = new Date(req.query.to);
        if (!isNaN(d.getTime())) { d.setHours(23, 59, 59, 999); filters.to = d; }
      }

      const where: Record<string, unknown> = { merchantId };
      if (filters.category) where.category = filters.category;
      if (filters.from || filters.to) {
        where.date = {};
        if (filters.from) (where.date as Record<string, unknown>).gte = filters.from;
        if (filters.to)   (where.date as Record<string, unknown>).lte = filters.to;
      }

      const [rows, total] = await Promise.all([
        prisma.expense.findMany({
          where,
          orderBy: { date: "desc" },
          skip: (pagination.page - 1) * pagination.limit,
          take: pagination.limit,
        }),
        prisma.expense.count({ where }),
      ]);

      const data = rows.map((e) => ({ ...e, amount: Number(e.amount) }));

      res.json({ success: true, data, meta: buildMeta(pagination.page, pagination.limit, total) });
    } catch (err) {
      next(err);
    }
  },

  // ─── Create ──────────────────────────────────────
  async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { category, description, amount, currency, date } = req.body as {
        category: string; description: string; amount: number;
        currency: string; date: string;
      };

      if (!category || !description || amount === undefined || !currency || !date) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "category, description, amount, currency, date are required" },
        });
        return;
      }

      const exp = await prisma.expense.create({
        data: {
          merchantId: req.merchant.id,
          category,
          description,
          amount,
          currency,
          date: new Date(date),
        },
      });

      // تحديث Analytics في الخلفية
      recalcAnalytics(req.merchant.id).catch(() => {});

      res.status(201).json({ success: true, data: { ...exp, amount: Number(exp.amount) } });
    } catch (err) {
      next(err);
    }
  },

  // ─── Update ──────────────────────────────────────
  async update(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const existing = await prisma.expense.findFirst({
        where: { id: req.params.id, merchantId: req.merchant.id },
      });
      if (!existing) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Expense not found" } });
        return;
      }

      const updated = await prisma.expense.update({
        where: { id: req.params.id },
        data: req.body,
      });

      recalcAnalytics(req.merchant.id).catch(() => {});

      res.json({ success: true, data: { ...updated, amount: Number(updated.amount) } });
    } catch (err) {
      next(err);
    }
  },

  // ─── Delete ──────────────────────────────────────
  async delete(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const existing = await prisma.expense.findFirst({
        where: { id: req.params.id, merchantId: req.merchant.id },
      });
      if (!existing) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Expense not found" } });
        return;
      }

      await prisma.expense.delete({ where: { id: req.params.id } });
      recalcAnalytics(req.merchant.id).catch(() => {});

      res.json({ success: true, data: { deleted: true } });
    } catch (err) {
      next(err);
    }
  },

  // ─── Summary (Core) ──────────────────────────────
  async summary(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const merchantId = req.merchant.id;

      const catRows = await prisma.$queryRawUnsafe<ExpenseSumRow[]>(
        `SELECT category,
                COALESCE(SUM(amount::numeric), 0)::float AS total,
                COUNT(*)::int AS count
         FROM expenses
         WHERE merchant_id = $1
         GROUP BY category`,
        merchantId
      );

      const totalExpenses = catRows.reduce((s: number, r: ExpenseSumRow) => s + Number(r.total), 0);

      const revenueRows = await prisma.$queryRawUnsafe<RevenueSumRow[]>(
        `SELECT COALESCE(SUM(amount::numeric), 0)::float AS total
         FROM transactions
         WHERE merchant_id = $1 AND status = 'SUCCESS' AND is_credit = TRUE
           AND created_at >= NOW() - INTERVAL '30 days'`,
        merchantId
      );
      const totalRevenue = Number(revenueRows[0]?.total ?? 0);

      res.json({
        success: true,
        data: {
          totalExpenses,
          totalRevenue,
          netProfit: totalRevenue - totalExpenses,
          categories: catRows.map((r: ExpenseSumRow) => ({
            category: r.category,
            total: Number(r.total),
            count: Number(r.count),
          })),
        },
      });
    } catch (err) {
      next(err);
    }
  },

  // ─── Analytics (Elite) ───────────────────────────
  async getAnalytics(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const merchantId = req.merchant.id;

      // إذا مفيش analytics محسوبة، احسب الآن
      const rows = await prisma.$queryRawUnsafe<AnalyticsRow[]>(
        `SELECT top_category, total_expenses, total_revenue, net_profit,
                profit_margin, category_breakdown, calculated_at
         FROM expense_analytics WHERE merchant_id = $1`,
        merchantId
      );

      if (rows.length === 0) {
        await recalcAnalytics(merchantId);
        const fresh = await prisma.$queryRawUnsafe<AnalyticsRow[]>(
          `SELECT top_category, total_expenses, total_revenue, net_profit,
                  profit_margin, category_breakdown, calculated_at
           FROM expense_analytics WHERE merchant_id = $1`,
          merchantId
        );
        if (fresh.length === 0) {
          res.json({ success: true, data: { topCategory: null, totalExpenses: 0, totalRevenue: 0, netProfit: 0, profitMargin: 0, categoryBreakdown: {} } });
          return;
        }
        const r: AnalyticsRow = fresh[0];
        res.json({
          success: true,
          data: {
            topCategory: r.top_category,
            totalExpenses: Number(r.total_expenses),
            totalRevenue: Number(r.total_revenue),
            netProfit: Number(r.net_profit),
            profitMargin: Number(r.profit_margin),
            categoryBreakdown: r.category_breakdown,
            calculatedAt: r.calculated_at,
          },
        });
        return;
      }

      const r: AnalyticsRow = rows[0];
      res.json({
        success: true,
        data: {
          topCategory: r.top_category,
          totalExpenses: Number(r.total_expenses),
          totalRevenue: Number(r.total_revenue),
          netProfit: Number(r.net_profit),
          profitMargin: Number(r.profit_margin),
          categoryBreakdown: r.category_breakdown,
          calculatedAt: r.calculated_at,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  // ─── Auto Import (Elite) ─────────────────────────
  // يستورد المصاريف تلقائياً من المعاملات الصادرة (is_credit = false)
  async autoImport(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const merchantId = req.merchant.id;
      const { days = 30 } = req.body as { days?: number };

      const txRows = await prisma.$queryRawUnsafe<TxRow[]>(
        `SELECT t.id, t.amount, t.currency, t.description, t.created_at
         FROM transactions t
         WHERE t.merchant_id = $1
           AND t.is_credit = FALSE
           AND t.status = 'SUCCESS'
           AND t.created_at >= NOW() - ($2 || ' days')::INTERVAL
           AND NOT EXISTS (
             SELECT 1 FROM expense_auto_imports ai WHERE ai.transaction_id = t.id
           )`,
        merchantId,
        String(days)
      );

      if (txRows.length === 0) {
        res.json({ success: true, data: { imported: 0, message: "لا توجد معاملات جديدة للاستيراد" } });
        return;
      }

      let imported = 0;
      for (const tx of txRows) {
        const exp = await prisma.expense.create({
          data: {
            merchantId,
            category: "other",
            description: tx.description ?? `استيراد تلقائي - ${tx.id.slice(0, 8)}`,
            amount: Number(tx.amount),
            currency: tx.currency,
            date: new Date(tx.created_at),
          },
        });

        await prisma.$executeRawUnsafe(
          `INSERT INTO expense_auto_imports (merchant_id, expense_id, transaction_id, source)
           VALUES ($1, $2, $3, 'auto_import')`,
          merchantId,
          exp.id,
          tx.id
        );

        imported++;
      }

      recalcAnalytics(merchantId).catch(() => {});

      res.json({
        success: true,
        data: { imported, message: `تم استيراد ${imported} مصروف تلقائياً` },
      });
    } catch (err) {
      next(err);
    }
  },

  // ─── Recalc Analytics (Elite) ────────────────────
  async refreshAnalytics(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      await recalcAnalytics(req.merchant.id);
      res.json({ success: true, data: { message: "تم تحديث التحليلات" } });
    } catch (err) {
      next(err);
    }
  },
};
