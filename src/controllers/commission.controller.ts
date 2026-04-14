// ─────────────────────────────────────────────────────────────
// src/controllers/commission.controller.ts
// Zyrix Backend — Commission Engine
// Color: #D97706
// ─────────────────────────────────────────────────────────────
import { Response, NextFunction } from "express"
import { AuthenticatedRequest } from "../types"
import { prisma } from "../config/database"

// ─── Types ────────────────────────────────────────────────────

interface RuleRow {
  id: string
  merchant_id: string
  name: string
  type: string
  value: number
  tiers: any
  applies_to: string
  is_active: boolean
  created_at: string
  updated_at: string
}

interface RecordRow {
  id: string
  merchant_id: string
  rule_id: string | null
  agent_name: string
  agent_id: string | null
  deal_id: string | null
  deal_title: string | null
  sale_amount: number
  commission_rate: number
  commission_amt: number
  currency: string
  status: string
  paid_at: string | null
  notes: string | null
  created_at: string
}

interface AgentStatsRow {
  agent_name: string
  agent_id: string | null
  total_sales: number
  total_commission: number
  paid_commission: number
  pending_commission: number
  record_count: number
}

function mapRule(r: RuleRow) {
  return {
    id:        r.id,
    name:      r.name,
    type:      r.type,
    value:     Number(r.value),
    tiers:     r.tiers,
    appliesTo: r.applies_to,
    isActive:  r.is_active,
    createdAt: r.created_at,
  }
}

function mapRecord(r: RecordRow) {
  return {
    id:             r.id,
    ruleId:         r.rule_id,
    agentName:      r.agent_name,
    agentId:        r.agent_id,
    dealId:         r.deal_id,
    dealTitle:      r.deal_title,
    saleAmount:     Number(r.sale_amount),
    commissionRate: Number(r.commission_rate),
    commissionAmt:  Number(r.commission_amt),
    currency:       r.currency,
    status:         r.status,
    paidAt:         r.paid_at,
    notes:          r.notes,
    createdAt:      r.created_at,
  }
}

// ─── Calculate commission based on rule ──────────────────────
function calcCommission(amount: number, rule: RuleRow): number {
  if (rule.type === "FIXED") return Number(rule.value)
  if (rule.type === "PERCENT") return Math.round(amount * Number(rule.value) / 100 * 100) / 100
  if (rule.type === "TIERED" && Array.isArray(rule.tiers)) {
    for (const tier of rule.tiers) {
      if (amount >= tier.min && (!tier.max || amount <= tier.max)) {
        return tier.type === "PERCENT"
          ? Math.round(amount * tier.value / 100 * 100) / 100
          : Number(tier.value)
      }
    }
  }
  return 0
}

// ─── Controller ──────────────────────────────────────────────

export const commissionController = {

  // ── List Rules ────────────────────────────────────────────
  async listRules(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const rows = await prisma.$queryRawUnsafe<RuleRow[]>(
        `SELECT * FROM commission_rules WHERE merchant_id = $1 ORDER BY created_at DESC`,
        req.merchant.id
      )
      res.json({ success: true, data: rows.map(mapRule) })
    } catch (err) { next(err) }
  },

  // ── Create Rule ───────────────────────────────────────────
  async createRule(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { name, type, value, tiers, appliesTo = "ALL" } = req.body as {
        name: string; type: string; value: number; tiers?: any; appliesTo?: string
      }

      if (!name || !type) {
        res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "name و type مطلوبان" } })
        return
      }

      const rows = await prisma.$queryRawUnsafe<RuleRow[]>(
        `INSERT INTO commission_rules (merchant_id, name, type, value, tiers, applies_to)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        req.merchant.id, name, type.toUpperCase(),
        Number(value || 0),
        tiers ? JSON.stringify(tiers) : null,
        appliesTo
      )
      res.json({ success: true, data: mapRule(rows[0]) })
    } catch (err) { next(err) }
  },

  // ── Update Rule ───────────────────────────────────────────
  async updateRule(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params
      const { name, value, tiers, appliesTo, isActive } = req.body

      const rows = await prisma.$queryRawUnsafe<RuleRow[]>(
        `UPDATE commission_rules SET
           name       = COALESCE($3, name),
           value      = COALESCE($4, value),
           tiers      = COALESCE($5, tiers),
           applies_to = COALESCE($6, applies_to),
           is_active  = COALESCE($7, is_active),
           updated_at = NOW()
         WHERE id = $1 AND merchant_id = $2 RETURNING *`,
        id, req.merchant.id,
        name ?? null,
        value !== undefined ? Number(value) : null,
        tiers ? JSON.stringify(tiers) : null,
        appliesTo ?? null,
        isActive !== undefined ? isActive : null
      )

      if (rows.length === 0) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "القاعدة غير موجودة" } })
        return
      }
      res.json({ success: true, data: mapRule(rows[0]) })
    } catch (err) { next(err) }
  },

  // ── Delete Rule ───────────────────────────────────────────
  async deleteRule(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      await prisma.$executeRawUnsafe(
        `DELETE FROM commission_rules WHERE id = $1 AND merchant_id = $2`,
        req.params.id, req.merchant.id
      )
      res.json({ success: true, data: { deleted: true } })
    } catch (err) { next(err) }
  },

  // ── Calculate (preview) ───────────────────────────────────
  async calculate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { amount, ruleId } = req.body as { amount: number; ruleId: string }

      if (!amount || !ruleId) {
        res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "amount و ruleId مطلوبان" } })
        return
      }

      const rules = await prisma.$queryRawUnsafe<RuleRow[]>(
        `SELECT * FROM commission_rules WHERE id = $1 AND merchant_id = $2 AND is_active = TRUE`,
        ruleId, req.merchant.id
      )

      if (rules.length === 0) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "القاعدة غير موجودة" } })
        return
      }

      const rule            = rules[0]
      const commissionAmt   = calcCommission(Number(amount), rule)
      const commissionRate  = Number(amount) > 0 ? commissionAmt / Number(amount) * 100 : 0

      res.json({
        success: true,
        data: {
          saleAmount:     Number(amount),
          commissionAmt:  Math.round(commissionAmt  * 100) / 100,
          commissionRate: Math.round(commissionRate * 100) / 100,
          ruleName:       rule.name,
          ruleType:       rule.type,
        },
      })
    } catch (err) { next(err) }
  },

  // ── Create Record ─────────────────────────────────────────
  async createRecord(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const {
        agentName, agentId, dealId, dealTitle,
        saleAmount, ruleId, currency = "SAR", notes,
        commissionRate: manualRate, commissionAmt: manualAmt,
      } = req.body as {
        agentName: string; agentId?: string; dealId?: string; dealTitle?: string
        saleAmount: number; ruleId?: string; currency?: string; notes?: string
        commissionRate?: number; commissionAmt?: number
      }

      if (!agentName || !saleAmount) {
        res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "agentName و saleAmount مطلوبان" } })
        return
      }

      let commissionAmt  = manualAmt  ?? 0
      let commissionRate = manualRate ?? 0

      if (ruleId) {
        const rules = await prisma.$queryRawUnsafe<RuleRow[]>(
          `SELECT * FROM commission_rules WHERE id = $1 AND merchant_id = $2`,
          ruleId, req.merchant.id
        )
        if (rules.length > 0) {
          commissionAmt  = calcCommission(Number(saleAmount), rules[0])
          commissionRate = Number(saleAmount) > 0 ? commissionAmt / Number(saleAmount) * 100 : 0
        }
      }

      const rows = await prisma.$queryRawUnsafe<RecordRow[]>(
        `INSERT INTO commission_records
           (merchant_id, rule_id, agent_name, agent_id, deal_id, deal_title,
            sale_amount, commission_rate, commission_amt, currency, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        req.merchant.id, ruleId ?? null, agentName,
        agentId ?? null, dealId ?? null, dealTitle ?? null,
        Number(saleAmount),
        Math.round(commissionRate * 10000) / 10000,
        Math.round(commissionAmt  * 100)   / 100,
        currency.toUpperCase(), notes ?? null
      )

      res.json({ success: true, data: mapRecord(rows[0]) })
    } catch (err) { next(err) }
  },

  // ── List Records ──────────────────────────────────────────
  async listRecords(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { status, agent } = req.query as Record<string, string>
      let where = `WHERE merchant_id = $1`
      const params: unknown[] = [req.merchant.id]
      let idx = 2

      if (status) { where += ` AND status = $${idx++}`; params.push(status.toUpperCase()) }
      if (agent)  { where += ` AND agent_name ILIKE $${idx++}`; params.push(`%${agent}%`) }

      const rows = await prisma.$queryRawUnsafe<RecordRow[]>(
        `SELECT * FROM commission_records ${where} ORDER BY created_at DESC`,
        ...params
      )
      res.json({ success: true, data: rows.map(mapRecord) })
    } catch (err) { next(err) }
  },

  // ── Update Record Status ──────────────────────────────────
  async updateRecordStatus(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id }     = req.params
      const { status } = req.body as { status: string }

      const validStatuses = ["PENDING", "APPROVED", "PAID", "CANCELLED"]
      if (!validStatuses.includes(status?.toUpperCase())) {
        res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "status غير صحيح" } })
        return
      }

      const rows = await prisma.$queryRawUnsafe<RecordRow[]>(
        `UPDATE commission_records SET
           status  = $1,
           paid_at = CASE WHEN $1 = 'PAID' THEN NOW() ELSE paid_at END
         WHERE id = $2 AND merchant_id = $3 RETURNING *`,
        status.toUpperCase(), id, req.merchant.id
      )

      res.json({ success: true, data: rows[0] ? mapRecord(rows[0]) : null })
    } catch (err) { next(err) }
  },

  // ── Agent Stats ───────────────────────────────────────────
  async getAgentStats(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const rows = await prisma.$queryRawUnsafe<AgentStatsRow[]>(
        `SELECT
           agent_name,
           agent_id,
           COALESCE(SUM(sale_amount)::float,       0) AS total_sales,
           COALESCE(SUM(commission_amt)::float,     0) AS total_commission,
           COALESCE(SUM(CASE WHEN status = 'PAID'    THEN commission_amt ELSE 0 END)::float, 0) AS paid_commission,
           COALESCE(SUM(CASE WHEN status = 'PENDING' THEN commission_amt ELSE 0 END)::float, 0) AS pending_commission,
           COUNT(*)::int AS record_count
         FROM commission_records
         WHERE merchant_id = $1
         GROUP BY agent_name, agent_id
         ORDER BY total_commission DESC`,
        req.merchant.id
      )

      res.json({
        success: true,
        data: rows.map(r => ({
          agentName:          r.agent_name,
          agentId:            r.agent_id,
          totalSales:         Math.round(Number(r.total_sales)         * 100) / 100,
          totalCommission:    Math.round(Number(r.total_commission)    * 100) / 100,
          paidCommission:     Math.round(Number(r.paid_commission)     * 100) / 100,
          pendingCommission:  Math.round(Number(r.pending_commission)  * 100) / 100,
          recordCount:        Number(r.record_count),
        })),
      })
    } catch (err) { next(err) }
  },

  // ── Summary Stats ─────────────────────────────────────────
  async getSummary(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT
           COALESCE(SUM(sale_amount)::float,   0)                                           AS total_sales,
           COALESCE(SUM(commission_amt)::float, 0)                                          AS total_commission,
           COALESCE(SUM(CASE WHEN status='PAID'     THEN commission_amt ELSE 0 END)::float, 0) AS paid,
           COALESCE(SUM(CASE WHEN status='PENDING'  THEN commission_amt ELSE 0 END)::float, 0) AS pending,
           COALESCE(SUM(CASE WHEN status='APPROVED' THEN commission_amt ELSE 0 END)::float, 0) AS approved,
           COUNT(*)::int                                                                     AS total_records,
           COUNT(DISTINCT agent_name)::int                                                   AS total_agents
         FROM commission_records WHERE merchant_id = $1`,
        req.merchant.id
      )

      res.json({
        success: true,
        data: {
          totalSales:      Math.round(Number(rows[0]?.total_sales)      * 100) / 100,
          totalCommission: Math.round(Number(rows[0]?.total_commission) * 100) / 100,
          paid:            Math.round(Number(rows[0]?.paid)             * 100) / 100,
          pending:         Math.round(Number(rows[0]?.pending)          * 100) / 100,
          approved:        Math.round(Number(rows[0]?.approved)         * 100) / 100,
          totalRecords:    Number(rows[0]?.total_records || 0),
          totalAgents:     Number(rows[0]?.total_agents  || 0),
        },
      })
    } catch (err) { next(err) }
  },
}
