// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Tax Engine Controller (Elite)
// VAT Multi-Country + Auto Calculation + Reports
// ─────────────────────────────────────────────────────────────
import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types";
import { prisma } from "../config/database";

// ─── Types ───────────────────────────────────────────────────

interface TaxRuleRow {
  id: string;
  country: string;
  tax_name: string;
  rate: number;
  applies_to: string;
  is_active: boolean;
  effective_from: string;
  created_at: string;
}

interface TaxCalcRow {
  id: string;
  rule_id: string | null;
  transaction_id: string | null;
  country: string;
  pre_tax: number;
  tax_amount: number;
  total: number;
  rate: number;
  currency: string;
  created_at: string;
}

interface TaxPeriodRow {
  period_year: number;
  period_month: number;
  total_pre_tax: number;
  total_tax: number;
  total_amount: number;
  calc_count: number;
  country: string;
}

// ─── Default VAT rates per country ───────────────────────────
const DEFAULT_VAT: Record<string, { rate: number; name: string }> = {
  SA: { rate: 0.15, name: "ضريبة القيمة المضافة" },
  AE: { rate: 0.05, name: "VAT" },
  TR: { rate: 0.20, name: "KDV" },
  KW: { rate: 0.00, name: "VAT" },
  QA: { rate: 0.00, name: "VAT" },
  EG: { rate: 0.14, name: "ضريبة القيمة المضافة" },
  IQ: { rate: 0.00, name: "VAT" },
};

// ─── Controller ──────────────────────────────────────────────

export const taxController = {
  // ─── List Rules ──────────────────────────────────
  async listRules(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const rows = await prisma.$queryRawUnsafe<TaxRuleRow[]>(
        `SELECT id, country, tax_name, rate, applies_to, is_active, effective_from, created_at
         FROM tax_rules WHERE merchant_id = $1 ORDER BY country`,
        req.merchant.id
      );

      // إضافة الدول التي لا توجد لها قواعد محددة من الـ defaults
      const existingCountries = new Set(rows.map((r: TaxRuleRow) => r.country));
      const defaultRules = Object.entries(DEFAULT_VAT)
        .filter(([country]) => !existingCountries.has(country))
        .map(([country, vat]) => ({
          id: `default_${country}`,
          country,
          taxName: vat.name,
          rate: vat.rate,
          appliesTo: "ALL",
          isActive: true,
          isDefault: true,
          effectiveFrom: null,
          createdAt: null,
        }));

      res.json({
        success: true,
        data: [
          ...rows.map((r: TaxRuleRow) => ({
            id: r.id,
            country: r.country,
            taxName: r.tax_name,
            rate: Number(r.rate),
            appliesTo: r.applies_to,
            isActive: r.is_active,
            isDefault: false,
            effectiveFrom: r.effective_from,
            createdAt: r.created_at,
          })),
          ...defaultRules,
        ],
      });
    } catch (err) { next(err); }
  },

  // ─── Upsert Rule ─────────────────────────────────
  async upsertRule(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { country, taxName, rate, appliesTo = "ALL" } = req.body as {
        country: string; taxName: string; rate: number; appliesTo?: string;
      };

      if (!country || !taxName || rate === undefined) {
        res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "country, taxName, rate required" } });
        return;
      }

      await prisma.$executeRawUnsafe(
        `INSERT INTO tax_rules (merchant_id, country, tax_name, rate, applies_to)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (merchant_id, country, tax_name)
         DO UPDATE SET rate = $4, applies_to = $5, is_active = TRUE`,
        req.merchant.id, country.toUpperCase(), taxName, rate, appliesTo
      );

      res.json({ success: true, data: { country, taxName, rate, message: "تم حفظ قاعدة الضريبة" } });
    } catch (err) { next(err); }
  },

  // ─── Calculate Tax (Elite) ───────────────────────
  async calculate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { amount, country, transactionId, currency = "SAR", save = true } = req.body as {
        amount: number; country: string; transactionId?: string;
        currency?: string; save?: boolean;
      };

      if (!amount || !country) {
        res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "amount and country required" } });
        return;
      }

      const countryUp = country.toUpperCase();

      // ابحث عن قاعدة مخصصة للمرتشنت أولاً
      const customRules = await prisma.$queryRawUnsafe<TaxRuleRow[]>(
        `SELECT * FROM tax_rules WHERE merchant_id = $1 AND country = $2 AND is_active = TRUE LIMIT 1`,
        req.merchant.id, countryUp
      );

      let rate: number;
      let taxName: string;
      let ruleId: string | null = null;

      if (customRules.length > 0) {
        rate    = Number(customRules[0].rate);
        taxName = customRules[0].tax_name;
        ruleId  = customRules[0].id;
      } else {
        const def = DEFAULT_VAT[countryUp];
        rate    = def?.rate ?? 0;
        taxName = def?.name ?? "VAT";
      }

      const taxAmount = Math.round(amount * rate * 100) / 100;
      const total     = Math.round((amount + taxAmount) * 100) / 100;

      if (save) {
        const now = new Date();
        await prisma.$executeRawUnsafe(
          `INSERT INTO tax_calculations
             (merchant_id, rule_id, transaction_id, country, pre_tax, tax_amount, total,
              rate, currency, period_month, period_year)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          req.merchant.id, ruleId, transactionId ?? null, countryUp,
          amount, taxAmount, total, rate, currency.toUpperCase(),
          now.getMonth() + 1, now.getFullYear()
        );
      }

      res.json({
        success: true,
        data: {
          country: countryUp,
          taxName,
          preTax: amount,
          rate,
          ratePercent: Math.round(rate * 100),
          taxAmount,
          total,
          currency: currency.toUpperCase(),
        },
      });
    } catch (err) { next(err); }
  },

  // ─── Bulk Calculate (Elite) ──────────────────────
  async bulkCalculate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { transactions, country, currency = "SAR" } = req.body as {
        transactions: { id: string; amount: number }[];
        country: string; currency?: string;
      };

      if (!Array.isArray(transactions) || !country) {
        res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "transactions array and country required" } });
        return;
      }

      const countryUp = country.toUpperCase();
      const customRules = await prisma.$queryRawUnsafe<TaxRuleRow[]>(
        `SELECT * FROM tax_rules WHERE merchant_id = $1 AND country = $2 AND is_active = TRUE LIMIT 1`,
        req.merchant.id, countryUp
      );

      const rate = customRules.length > 0
        ? Number(customRules[0].rate)
        : (DEFAULT_VAT[countryUp]?.rate ?? 0);
      const ruleId = customRules[0]?.id ?? null;
      const now = new Date();

      const results = [];
      let totalTax = 0;

      for (const tx of transactions) {
        const taxAmount = Math.round(tx.amount * rate * 100) / 100;
        const total     = Math.round((tx.amount + taxAmount) * 100) / 100;

        await prisma.$executeRawUnsafe(
          `INSERT INTO tax_calculations
             (merchant_id, rule_id, transaction_id, country, pre_tax, tax_amount, total,
              rate, currency, period_month, period_year)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          req.merchant.id, ruleId, tx.id, countryUp,
          tx.amount, taxAmount, total, rate, currency.toUpperCase(),
          now.getMonth() + 1, now.getFullYear()
        );

        results.push({ transactionId: tx.id, preTax: tx.amount, taxAmount, total });
        totalTax += taxAmount;
      }

      res.json({
        success: true,
        data: {
          processed: results.length,
          country: countryUp,
          rate,
          totalTax: Math.round(totalTax * 100) / 100,
          results,
        },
      });
    } catch (err) { next(err); }
  },

  // ─── Tax Report by Period (Elite) ────────────────
  async getPeriodReport(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const year  = parseInt(req.query.year  as string) || new Date().getFullYear();
      const month = req.query.month ? parseInt(req.query.month as string) : null;

      const whereMonth = month ? `AND period_month = ${month}` : "";

      const rows = await prisma.$queryRawUnsafe<TaxPeriodRow[]>(
        `SELECT period_year, period_month, country,
                COALESCE(SUM(pre_tax::numeric), 0)::float    AS total_pre_tax,
                COALESCE(SUM(tax_amount::numeric), 0)::float AS total_tax,
                COALESCE(SUM(total::numeric), 0)::float      AS total_amount,
                COUNT(*)::int                                 AS calc_count
         FROM tax_calculations
         WHERE merchant_id = $1 AND period_year = $2 ${whereMonth}
         GROUP BY period_year, period_month, country
         ORDER BY period_month, country`,
        req.merchant.id, year
      );

      const totalTax = rows.reduce((s: number, r: TaxPeriodRow) => s + Number(r.total_tax), 0);

      res.json({
        success: true,
        data: {
          year,
          month: month ?? "all",
          totalTax: Math.round(totalTax * 100) / 100,
          byPeriod: rows.map((r: TaxPeriodRow) => ({
            year: Number(r.period_year),
            month: Number(r.period_month),
            country: r.country,
            totalPreTax: Number(r.total_pre_tax),
            totalTax: Number(r.total_tax),
            totalAmount: Number(r.total_amount),
            calcCount: Number(r.calc_count),
          })),
        },
      });
    } catch (err) { next(err); }
  },

  // ─── Country Rates Overview ──────────────────────
  async getCountryRates(_req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      res.json({
        success: true,
        data: Object.entries(DEFAULT_VAT).map(([country, vat]) => ({
          country,
          taxName: vat.name,
          rate: vat.rate,
          ratePercent: Math.round(vat.rate * 100),
        })),
      });
    } catch (err) { next(err); }
  },
};
