// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Commission Engine Controller (Elite)
// Rules + Calculation + Partners + Multi-tier
// ─────────────────────────────────────────────────────────────
import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types";
import { prisma } from "../config/database";

// ─── Types ───────────────────────────────────────────────────

interface CommissionRuleRow {
  id: string;
  name: string;
  type: string;
  rate: number | null;
  fixed_amount: number | null;
  tiers: unknown;
  applies_to: string;
  entity_id: string | null;
  currency: string;
  is_active: boolean;
  created_at: string;
}

interface CommissionCalcRow {
  id: string;
  rule_id: string;
  rule_name: string;
  transaction_id: string | null;
  base_amount: number;
  commission: number;
  currency: string;
  partner_id: string | null;
  note: string | null;
  created_at: string;
}

interface CommissionPartnerRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  split_percent: number;
  total_earned: number;
  is_active: boolean;
  created_at: string;
}

interface SummaryRow {
  total_base: number;
  total_commission: number;
  calc_count: number;
}

// ─── Helpers ─────────────────────────────────────────────────

function calcCommission(type: string, amount: number, rate: number | null, fixedAmount: number | null, tiers: unknown): number {
  if (type === "PERCENTAGE" && rate) {
    return Math.round(amount * Number(rate) * 100) / 100;
  }
  if (type === "FIXED" && fixedAmount) {
    return Number(fixedAmount);
  }
  if (type === "TIERED" && Array.isArray(tiers)) {
    const sorted = [...tiers].sort((a: any, b: any) => b.min - a.min);
    for (const tier of sorted as any[]) {
      if (amount >= tier.min && (tier.max === null || amount <= tier.max)) {
        return Math.round(amount * Number(tier.rate) * 100) / 100;
      }
    }
  }
  return 0;
}

// ─── Controller ──────────────────────────────────────────────

export const commissionController = {
  // ─── List Rules ──────────────────────────────────
  async listRules(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const rows = await prisma.$queryRawUnsafe<CommissionRuleRow[]>(
        `SELECT id, name, type, rate, fixed_amount, tiers, applies_to,
                entity_id, currency, is_active, created_at
         FROM commission_rules
         WHERE merchant_id = $1
         ORDER BY created_at DESC`,
        req.merchant.id
      );

      res.json({
        success: true,
        data: rows.map((r: CommissionRuleRow) => ({
          id: r.id,
          name: r.name,
          type: r.type,
          rate: r.rate ? Number(r.rate) : null,
          fixedAmount: r.fixed_amount ? Number(r.fixed_amount) : null,
          tiers: r.tiers,
          appliesTo: r.applies_to,
          entityId: r.entity_id,
          currency: r.currency,
          isActive: r.is_active,
          createdAt: r.created_at,
        })),
      });
    } catch (err) { next(err); }
  },

  // ─── Create Rule ─────────────────────────────────
  async createRule(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { name, type, rate, fixedAmount, tiers, appliesTo = "ALL", entityId, currency = "SAR" } = req.body as {
        name: string; type: string; rate?: number; fixedAmount?: number;
        tiers?: unknown[]; appliesTo?: string; entityId?: string; currency?: string;
      };

      if (!name || !type) {
        res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "name and type are required" } });
        return;
      }
      if (!["PERCENTAGE", "FIXED", "TIERED"].includes(type.toUpperCase())) {
        res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "type must be PERCENTAGE, FIXED, or TIERED" } });
        return;
      }

      await prisma.$executeRawUnsafe(
        `INSERT INTO commission_rules
           (merchant_id, name, type, rate, fixed_amount, tiers, applies_to, entity_id, currency)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)`,
        req.merchant.id, name, type.toUpperCase(),
        rate ?? null, fixedAmount ?? null,
        JSON.stringify(tiers ?? null),
        appliesTo, entityId ?? null, currency.toUpperCase()
      );

      const created = await prisma.$queryRawUnsafe<CommissionRuleRow[]>(
        `SELECT * FROM commission_rules WHERE merchant_id = $1 ORDER BY created_at DESC LIMIT 1`,
        req.merchant.id
      );

      res.status(201).json({ success: true, data: created[0] ?? null });
    } catch (err) { next(err); }
  },

  // ─── Update Rule ─────────────────────────────────
  async updateRule(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const existing = await prisma.$queryRawUnsafe<CommissionRuleRow[]>(
        `SELECT id FROM commission_rules WHERE id = $1 AND merchant_id = $2`,
        id, req.merchant.id
      );
      if (existing.length === 0) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Rule not found" } });
        return;
      }

      const { name, isActive } = req.body as { name?: string; isActive?: boolean };
      if (name !== undefined) {
        await prisma.$executeRawUnsafe(`UPDATE commission_rules SET name = $1, updated_at = NOW() WHERE id = $2`, name, id);
      }
      if (isActive !== undefined) {
        await prisma.$executeRawUnsafe(`UPDATE commission_rules SET is_active = $1, updated_at = NOW() WHERE id = $2`, isActive, id);
      }

      res.json({ success: true, data: { updated: true } });
    } catch (err) { next(err); }
  },

  // ─── Delete Rule ─────────────────────────────────
  async deleteRule(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const existing = await prisma.$queryRawUnsafe<CommissionRuleRow[]>(
        `SELECT id FROM commission_rules WHERE id = $1 AND merchant_id = $2`,
        id, req.merchant.id
      );
      if (existing.length === 0) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Rule not found" } });
        return;
      }
      await prisma.$executeRawUnsafe(`DELETE FROM commission_rules WHERE id = $1`, id);
      res.json({ success: true, data: { deleted: true } });
    } catch (err) { next(err); }
  },

  // ─── Calculate Commission (Elite) ────────────────
  async calculate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { ruleId, amount, transactionId, partnerId, note } = req.body as {
        ruleId: string; amount: number; transactionId?: string; partnerId?: string; note?: string;
      };

      if (!ruleId || amount === undefined) {
        res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "ruleId and amount are required" } });
        return;
      }

      const rules = await prisma.$queryRawUnsafe<CommissionRuleRow[]>(
        `SELECT * FROM commission_rules WHERE id = $1 AND merchant_id = $2`,
        ruleId, req.merchant.id
      );
      if (rules.length === 0) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Rule not found" } });
        return;
      }

      const rule = rules[0];
      const commission = calcCommission(rule.type, amount, rule.rate, rule.fixed_amount, rule.tiers);

      await prisma.$executeRawUnsafe(
        `INSERT INTO commission_calculations
           (merchant_id, rule_id, transaction_id, base_amount, commission, currency, partner_id, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        req.merchant.id, ruleId, transactionId ?? null,
        amount, commission, rule.currency, partnerId ?? null, note ?? null
      );

      // تحديث partner earnings لو موجود
      if (partnerId) {
        const partnerCommission = Math.round(commission * 0.8 * 100) / 100;
        await prisma.$executeRawUnsafe(
          `UPDATE commission_partners SET total_earned = total_earned + $1 WHERE id = $2 AND merchant_id = $3`,
          partnerCommission, partnerId, req.merchant.id
        );
      }

      res.json({
        success: true,
        data: {
          baseAmount: amount,
          commission,
          currency: rule.currency,
          ruleName: rule.name,
          ruleType: rule.type,
          netAmount: amount - commission,
        },
      });
    } catch (err) { next(err); }
  },

  // ─── Bulk Calculate (Elite) ──────────────────────
  async bulkCalculate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { ruleId, transactions } = req.body as {
        ruleId: string; transactions: { id: string; amount: number }[];
      };

      if (!ruleId || !Array.isArray(transactions) || transactions.length === 0) {
        res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "ruleId and transactions array required" } });
        return;
      }

      const rules = await prisma.$queryRawUnsafe<CommissionRuleRow[]>(
        `SELECT * FROM commission_rules WHERE id = $1 AND merchant_id = $2`,
        ruleId, req.merchant.id
      );
      if (rules.length === 0) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Rule not found" } });
        return;
      }

      const rule = rules[0];
      const results = [];
      let totalCommission = 0;
      let totalBase = 0;

      for (const tx of transactions) {
        const commission = calcCommission(rule.type, tx.amount, rule.rate, rule.fixed_amount, rule.tiers);
        await prisma.$executeRawUnsafe(
          `INSERT INTO commission_calculations
             (merchant_id, rule_id, transaction_id, base_amount, commission, currency)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          req.merchant.id, ruleId, tx.id, tx.amount, commission, rule.currency
        );
        results.push({ transactionId: tx.id, baseAmount: tx.amount, commission, netAmount: tx.amount - commission });
        totalCommission += commission;
        totalBase += tx.amount;
      }

      res.json({
        success: true,
        data: {
          processed: results.length,
          totalBase: Math.round(totalBase * 100) / 100,
          totalCommission: Math.round(totalCommission * 100) / 100,
          totalNet: Math.round((totalBase - totalCommission) * 100) / 100,
          results,
        },
      });
    } catch (err) { next(err); }
  },

  // ─── History ─────────────────────────────────────
  async getHistory(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const rows = await prisma.$queryRawUnsafe<CommissionCalcRow[]>(
        `SELECT c.id, c.rule_id, r.name AS rule_name, c.transaction_id,
                c.base_amount, c.commission, c.currency, c.partner_id, c.note, c.created_at
         FROM commission_calculations c
         JOIN commission_rules r ON r.id = c.rule_id
         WHERE c.merchant_id = $1
         ORDER BY c.created_at DESC
         LIMIT $2`,
        req.merchant.id, limit
      );

      res.json({
        success: true,
        data: rows.map((r: CommissionCalcRow) => ({
          id: r.id,
          ruleId: r.rule_id,
          ruleName: r.rule_name,
          transactionId: r.transaction_id,
          baseAmount: Number(r.base_amount),
          commission: Number(r.commission),
          currency: r.currency,
          partnerId: r.partner_id,
          note: r.note,
          createdAt: r.created_at,
        })),
      });
    } catch (err) { next(err); }
  },

  // ─── Summary (Elite) ─────────────────────────────
  async getSummary(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const rows = await prisma.$queryRawUnsafe<SummaryRow[]>(
        `SELECT COALESCE(SUM(base_amount::numeric), 0)::float AS total_base,
                COALESCE(SUM(commission::numeric), 0)::float AS total_commission,
                COUNT(*)::int AS calc_count
         FROM commission_calculations
         WHERE merchant_id = $1`,
        req.merchant.id
      );

      const partners = await prisma.$queryRawUnsafe<CommissionPartnerRow[]>(
        `SELECT id, name, split_percent, total_earned FROM commission_partners
         WHERE merchant_id = $1 AND is_active = TRUE ORDER BY total_earned DESC`,
        req.merchant.id
      );

      const r = rows[0];
      res.json({
        success: true,
        data: {
          totalBase: Number(r.total_base),
          totalCommission: Number(r.total_commission),
          totalNet: Number(r.total_base) - Number(r.total_commission),
          calcCount: Number(r.calc_count),
          commissionRate: r.total_base > 0
            ? Math.round((Number(r.total_commission) / Number(r.total_base)) * 10000) / 100
            : 0,
          partners: partners.map((p: CommissionPartnerRow) => ({
            id: p.id,
            name: p.name,
            splitPercent: Number(p.split_percent),
            totalEarned: Number(p.total_earned),
          })),
        },
      });
    } catch (err) { next(err); }
  },

  // ─── Partners ────────────────────────────────────
  async listPartners(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const rows = await prisma.$queryRawUnsafe<CommissionPartnerRow[]>(
        `SELECT id, name, email, phone, split_percent, total_earned, is_active, created_at
         FROM commission_partners WHERE merchant_id = $1 ORDER BY created_at DESC`,
        req.merchant.id
      );
      res.json({
        success: true,
        data: rows.map((r: CommissionPartnerRow) => ({
          id: r.id, name: r.name, email: r.email, phone: r.phone,
          splitPercent: Number(r.split_percent), totalEarned: Number(r.total_earned),
          isActive: r.is_active, createdAt: r.created_at,
        })),
      });
    } catch (err) { next(err); }
  },

  async createPartner(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { name, email, phone, splitPercent = 0 } = req.body as {
        name: string; email?: string; phone?: string; splitPercent?: number;
      };
      if (!name) {
        res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "name is required" } });
        return;
      }
      await prisma.$executeRawUnsafe(
        `INSERT INTO commission_partners (merchant_id, name, email, phone, split_percent)
         VALUES ($1, $2, $3, $4, $5)`,
        req.merchant.id, name, email ?? null, phone ?? null, splitPercent
      );
      const created = await prisma.$queryRawUnsafe<CommissionPartnerRow[]>(
        `SELECT * FROM commission_partners WHERE merchant_id = $1 ORDER BY created_at DESC LIMIT 1`,
        req.merchant.id
      );
      res.status(201).json({ success: true, data: created[0] ?? null });
    } catch (err) { next(err); }
  },
};
