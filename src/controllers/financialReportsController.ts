// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Financial Reports Controller (Elite)
// P&L + Cash Flow + Revenue + Expense + Tax + Custom Export
// ─────────────────────────────────────────────────────────────
import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types";
import { prisma } from "../config/database";

// ─── Types ───────────────────────────────────────────────────

interface ReportRow {
  id: string;
  report_type: string;
  name: string;
  period_start: string;
  period_end: string;
  currency: string;
  data: unknown;
  status: string;
  created_at: string;
}

interface TxSumRow { total: number; count: number }
interface ExpSumRow { total: number; count: number }
interface TaxSumRow { total_tax: number }
interface TxMonthRow { month: string; revenue: number; count: number }
interface ExpCatRow  { category: string; total: number }

// ─── Helpers ─────────────────────────────────────────────────

async function buildPNL(merchantId: string, start: Date, end: Date, currency: string) {
  const [revRow, expRow, taxRow] = await Promise.all([
    prisma.$queryRawUnsafe<TxSumRow[]>(
      `SELECT COALESCE(SUM(amount::numeric), 0)::float AS total, COUNT(*)::int AS count
       FROM transactions
       WHERE merchant_id = $1 AND status = 'SUCCESS' AND is_credit = TRUE
         AND created_at BETWEEN $2 AND $3`,
      merchantId, start.toISOString(), end.toISOString()
    ),
    prisma.$queryRawUnsafe<ExpSumRow[]>(
      `SELECT COALESCE(SUM(amount::numeric), 0)::float AS total, COUNT(*)::int AS count
       FROM expenses WHERE merchant_id = $1 AND date BETWEEN $2 AND $3`,
      merchantId, start.toISOString(), end.toISOString()
    ),
    prisma.$queryRawUnsafe<TaxSumRow[]>(
      `SELECT COALESCE(SUM(tax_amount::numeric), 0)::float AS total_tax
       FROM tax_calculations WHERE merchant_id = $1 AND created_at BETWEEN $2 AND $3`,
      merchantId, start.toISOString(), end.toISOString()
    ),
  ]);

  const revenue  = Number(revRow[0]?.total ?? 0);
  const expenses = Number(expRow[0]?.total ?? 0);
  const tax      = Number(taxRow[0]?.total_tax ?? 0);
  const grossProfit = revenue - expenses;
  const netProfit   = grossProfit - tax;
  const margin      = revenue > 0 ? Math.round((netProfit / revenue) * 100) : 0;

  return {
    revenue, expenses, tax, grossProfit, netProfit, margin,
    txCount: Number(revRow[0]?.count ?? 0),
    expCount: Number(expRow[0]?.count ?? 0),
    currency,
  };
}

async function buildCashFlow(merchantId: string, start: Date, end: Date, currency: string) {
  const [inRow, outRow, monthRows] = await Promise.all([
    prisma.$queryRawUnsafe<TxSumRow[]>(
      `SELECT COALESCE(SUM(amount::numeric), 0)::float AS total, COUNT(*)::int AS count
       FROM transactions WHERE merchant_id = $1 AND status = 'SUCCESS' AND is_credit = TRUE
         AND created_at BETWEEN $2 AND $3`,
      merchantId, start.toISOString(), end.toISOString()
    ),
    prisma.$queryRawUnsafe<TxSumRow[]>(
      `SELECT COALESCE(SUM(amount::numeric), 0)::float AS total, COUNT(*)::int AS count
       FROM expenses WHERE merchant_id = $1 AND date BETWEEN $2 AND $3`,
      merchantId, start.toISOString(), end.toISOString()
    ),
    prisma.$queryRawUnsafe<TxMonthRow[]>(
      `SELECT TO_CHAR(created_at, 'YYYY-MM') AS month,
              COALESCE(SUM(amount::numeric), 0)::float AS revenue,
              COUNT(*)::int AS count
       FROM transactions WHERE merchant_id = $1 AND status = 'SUCCESS' AND is_credit = TRUE
         AND created_at BETWEEN $2 AND $3
       GROUP BY month ORDER BY month`,
      merchantId, start.toISOString(), end.toISOString()
    ),
  ]);

  const totalIn  = Number(inRow[0]?.total  ?? 0);
  const totalOut = Number(outRow[0]?.total ?? 0);

  return {
    totalInflow: totalIn,
    totalOutflow: totalOut,
    netCashFlow: totalIn - totalOut,
    currency,
    monthlyBreakdown: monthRows.map((r: TxMonthRow) => ({
      month: r.month, revenue: Number(r.revenue), count: Number(r.count),
    })),
  };
}

async function buildExpenseReport(merchantId: string, start: Date, end: Date, currency: string) {
  const [totalRow, catRows] = await Promise.all([
    prisma.$queryRawUnsafe<ExpSumRow[]>(
      `SELECT COALESCE(SUM(amount::numeric), 0)::float AS total, COUNT(*)::int AS count
       FROM expenses WHERE merchant_id = $1 AND date BETWEEN $2 AND $3`,
      merchantId, start.toISOString(), end.toISOString()
    ),
    prisma.$queryRawUnsafe<ExpCatRow[]>(
      `SELECT category, COALESCE(SUM(amount::numeric), 0)::float AS total
       FROM expenses WHERE merchant_id = $1 AND date BETWEEN $2 AND $3
       GROUP BY category ORDER BY total DESC`,
      merchantId, start.toISOString(), end.toISOString()
    ),
  ]);

  const total = Number(totalRow[0]?.total ?? 0);
  return {
    total, currency,
    count: Number(totalRow[0]?.count ?? 0),
    byCategory: catRows.map((r: ExpCatRow) => ({
      category: r.category,
      total: Number(r.total),
      percent: total > 0 ? Math.round((Number(r.total) / total) * 100) : 0,
    })),
  };
}

// ─── Controller ──────────────────────────────────────────────

export const financialReportsController = {
  // ─── List Reports ────────────────────────────────
  async list(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const rows = await prisma.$queryRawUnsafe<ReportRow[]>(
        `SELECT id, report_type, name, period_start, period_end, currency, status, created_at
         FROM financial_reports WHERE merchant_id = $1 ORDER BY created_at DESC LIMIT 30`,
        req.merchant.id
      );
      res.json({
        success: true,
        data: rows.map((r: ReportRow) => ({
          id: r.id,
          reportType: r.report_type,
          name: r.name,
          periodStart: r.period_start,
          periodEnd: r.period_end,
          currency: r.currency,
          status: r.status,
          createdAt: r.created_at,
        })),
      });
    } catch (err) { next(err); }
  },

  // ─── Generate Report (Elite) ─────────────────────
  async generate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { reportType, periodStart, periodEnd, currency = "SAR", name } = req.body as {
        reportType: string; periodStart: string; periodEnd: string;
        currency?: string; name?: string;
      };

      if (!reportType || !periodStart || !periodEnd) {
        res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "reportType, periodStart, periodEnd required" } });
        return;
      }

      const validTypes = ["PNL", "CASH_FLOW", "REVENUE", "EXPENSE", "TAX", "CUSTOM"];
      if (!validTypes.includes(reportType.toUpperCase())) {
        res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: `reportType must be one of: ${validTypes.join(", ")}` } });
        return;
      }

      const start = new Date(periodStart);
      const end   = new Date(periodEnd);
      const typeUp = reportType.toUpperCase();
      const merchantId = req.merchant.id;

      let data: unknown = {};

      if (typeUp === "PNL") {
        data = await buildPNL(merchantId, start, end, currency);
      } else if (typeUp === "CASH_FLOW") {
        data = await buildCashFlow(merchantId, start, end, currency);
      } else if (typeUp === "EXPENSE") {
        data = await buildExpenseReport(merchantId, start, end, currency);
      } else if (typeUp === "REVENUE") {
        const [revRow, monthRows] = await Promise.all([
          prisma.$queryRawUnsafe<TxSumRow[]>(
            `SELECT COALESCE(SUM(amount::numeric), 0)::float AS total, COUNT(*)::int AS count
             FROM transactions WHERE merchant_id = $1 AND status = 'SUCCESS' AND is_credit = TRUE
               AND created_at BETWEEN $2 AND $3`,
            merchantId, start.toISOString(), end.toISOString()
          ),
          prisma.$queryRawUnsafe<TxMonthRow[]>(
            `SELECT TO_CHAR(created_at, 'YYYY-MM') AS month,
                    COALESCE(SUM(amount::numeric), 0)::float AS revenue,
                    COUNT(*)::int AS count
             FROM transactions WHERE merchant_id = $1 AND status = 'SUCCESS' AND is_credit = TRUE
               AND created_at BETWEEN $2 AND $3
             GROUP BY month ORDER BY month`,
            merchantId, start.toISOString(), end.toISOString()
          ),
        ]);
        data = {
          totalRevenue: Number(revRow[0]?.total ?? 0),
          txCount: Number(revRow[0]?.count ?? 0),
          currency,
          monthly: monthRows.map((r: TxMonthRow) => ({ month: r.month, revenue: Number(r.revenue), count: Number(r.count) })),
        };
      } else if (typeUp === "TAX") {
        const taxRows = await prisma.$queryRawUnsafe<any[]>(
          `SELECT country,
                  COALESCE(SUM(pre_tax::numeric), 0)::float    AS total_pre_tax,
                  COALESCE(SUM(tax_amount::numeric), 0)::float AS total_tax,
                  COALESCE(SUM(total::numeric), 0)::float      AS total_with_tax
           FROM tax_calculations WHERE merchant_id = $1 AND created_at BETWEEN $2 AND $3
           GROUP BY country ORDER BY total_tax DESC`,
          merchantId, start.toISOString(), end.toISOString()
        );
        const totalTax = taxRows.reduce((s: number, r: any) => s + Number(r.total_tax), 0);
        data = { totalTax: Math.round(totalTax * 100) / 100, currency, byCountry: taxRows };
      } else {
        // CUSTOM = PNL + CashFlow معاً
        const [pnl, cashFlow] = await Promise.all([
          buildPNL(merchantId, start, end, currency),
          buildCashFlow(merchantId, start, end, currency),
        ]);
        data = { pnl, cashFlow };
      }

      const reportName = name ?? `${typeUp} — ${start.toLocaleDateString("ar-SA")} إلى ${end.toLocaleDateString("ar-SA")}`;

      await prisma.$executeRawUnsafe(
        `INSERT INTO financial_reports
           (merchant_id, report_type, name, period_start, period_end, currency, data, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, 'READY')`,
        merchantId, typeUp, reportName,
        start.toISOString(), end.toISOString(),
        currency.toUpperCase(), JSON.stringify(data)
      );

      const saved = await prisma.$queryRawUnsafe<ReportRow[]>(
        `SELECT * FROM financial_reports WHERE merchant_id = $1 ORDER BY created_at DESC LIMIT 1`,
        merchantId
      );

      res.json({
        success: true,
        data: {
          id: saved[0]?.id,
          reportType: typeUp,
          name: reportName,
          periodStart: start.toISOString(),
          periodEnd: end.toISOString(),
          currency,
          reportData: data,
          status: "READY",
        },
      });
    } catch (err) { next(err); }
  },

  // ─── Get Report ──────────────────────────────────
  async getById(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const rows = await prisma.$queryRawUnsafe<ReportRow[]>(
        `SELECT * FROM financial_reports WHERE id = $1 AND merchant_id = $2`,
        req.params.id, req.merchant.id
      );
      if (rows.length === 0) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Report not found" } });
        return;
      }
      const r = rows[0];
      res.json({
        success: true,
        data: {
          id: r.id,
          reportType: r.report_type,
          name: r.name,
          periodStart: r.period_start,
          periodEnd: r.period_end,
          currency: r.currency,
          reportData: r.data,
          status: r.status,
          createdAt: r.created_at,
        },
      });
    } catch (err) { next(err); }
  },

  // ─── Delete Report ───────────────────────────────
  async delete(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      await prisma.$executeRawUnsafe(
        `DELETE FROM financial_reports WHERE id = $1 AND merchant_id = $2`,
        req.params.id, req.merchant.id
      );
      res.json({ success: true, data: { deleted: true } });
    } catch (err) { next(err); }
  },

  // ─── Quick PNL (Elite) ───────────────────────────
  async getQuickPNL(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const range = (req.query.range as string) || "30d";
      const days  = range === "7d" ? 7 : range === "90d" ? 90 : 30;
      const end   = new Date();
      const start = new Date(); start.setDate(start.getDate() - days);

      const data = await buildPNL(req.merchant.id, start, end, "SAR");
      res.json({ success: true, data });
    } catch (err) { next(err); }
  },
};
