// ─────────────────────────────────────────────────────────────
// src/controllers/adCampaigns.controller.ts
// Zyrix Backend — Campaign Management
// Color: #7C3AED
// ─────────────────────────────────────────────────────────────
import { Response, NextFunction } from "express"
import { AuthenticatedRequest } from "../types"
import { prisma } from "../config/database"

// ─── Types ────────────────────────────────────────────────────

interface CampaignRow {
  id: string; merchant_id: string; name: string
  platform: string; objective: string; status: string
  budget: number; spent: number; currency: string
  impressions: number; clicks: number; conversions: number; revenue: number
  start_date: string | null; end_date: string | null
  utm_source: string | null; utm_medium: string | null; utm_campaign: string | null
  notes: string | null; created_at: string; updated_at: string
}

interface SummaryRow {
  total: number; active: number; draft: number; completed: number
  total_budget: number; total_spent: number; total_impressions: number
  total_clicks: number; total_conversions: number; total_revenue: number
}

function mapCampaign(r: CampaignRow) {
  const ctr  = r.impressions > 0 ? Math.round(r.clicks / r.impressions * 100 * 100) / 100 : 0
  const roas = Number(r.spent) > 0 ? Math.round(Number(r.revenue) / Number(r.spent) * 100) / 100 : 0
  const cpc  = r.clicks > 0 ? Math.round(Number(r.spent) / r.clicks * 100) / 100 : 0
  const cpa  = r.conversions > 0 ? Math.round(Number(r.spent) / r.conversions * 100) / 100 : 0
  return {
    id: r.id, name: r.name, platform: r.platform, objective: r.objective, status: r.status,
    budget: Number(r.budget), spent: Number(r.spent), currency: r.currency,
    impressions: Number(r.impressions), clicks: Number(r.clicks),
    conversions: Number(r.conversions), revenue: Number(r.revenue),
    ctr, roas, cpc, cpa,
    startDate: r.start_date, endDate: r.end_date,
    utmSource: r.utm_source, utmMedium: r.utm_medium, utmCampaign: r.utm_campaign,
    notes: r.notes, createdAt: r.created_at,
  }
}

// ─── Controller ──────────────────────────────────────────────

export const adCampaignsController = {

  // ── Summary ───────────────────────────────────────────────
  async getSummary(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const rows = await prisma.$queryRawUnsafe<SummaryRow[]>(
        `SELECT
           COUNT(*)::int                                         AS total,
           COUNT(*) FILTER (WHERE status='ACTIVE')::int         AS active,
           COUNT(*) FILTER (WHERE status='DRAFT')::int          AS draft,
           COUNT(*) FILTER (WHERE status='COMPLETED')::int      AS completed,
           COALESCE(SUM(budget)::float,      0)                 AS total_budget,
           COALESCE(SUM(spent)::float,       0)                 AS total_spent,
           COALESCE(SUM(impressions)::float, 0)                 AS total_impressions,
           COALESCE(SUM(clicks)::float,      0)                 AS total_clicks,
           COALESCE(SUM(conversions)::float, 0)                 AS total_conversions,
           COALESCE(SUM(revenue)::float,     0)                 AS total_revenue
         FROM ad_campaigns WHERE merchant_id = $1`,
        req.merchant.id
      )
      const r = rows[0]
      const totalSpent = Number(r?.total_spent || 0)
      const totalRev   = Number(r?.total_revenue || 0)
      res.json({
        success: true,
        data: {
          total:            Number(r?.total || 0),
          active:           Number(r?.active || 0),
          draft:            Number(r?.draft || 0),
          completed:        Number(r?.completed || 0),
          totalBudget:      Math.round(Number(r?.total_budget || 0) * 100) / 100,
          totalSpent:       Math.round(totalSpent * 100) / 100,
          totalImpressions: Number(r?.total_impressions || 0),
          totalClicks:      Number(r?.total_clicks || 0),
          totalConversions: Number(r?.total_conversions || 0),
          totalRevenue:     Math.round(totalRev * 100) / 100,
          overallROAS:      totalSpent > 0 ? Math.round(totalRev / totalSpent * 100) / 100 : 0,
        },
      })
    } catch (err) { next(err) }
  },

  // ── List ──────────────────────────────────────────────────
  async list(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { status, platform } = req.query as Record<string, string>
      let where = `WHERE merchant_id = $1`
      const params: unknown[] = [req.merchant.id]
      let idx = 2
      if (status)   { where += ` AND status = $${idx++}`;   params.push(status.toUpperCase()) }
      if (platform) { where += ` AND platform = $${idx++}`; params.push(platform.toUpperCase()) }

      const rows = await prisma.$queryRawUnsafe<CampaignRow[]>(
        `SELECT * FROM ad_campaigns ${where} ORDER BY created_at DESC`,
        ...params
      )
      res.json({ success: true, data: rows.map(mapCampaign) })
    } catch (err) { next(err) }
  },

  // ── Create ────────────────────────────────────────────────
  async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { name, platform, objective = "CONVERSIONS", budget = 0, currency = "SAR",
              startDate, endDate, utmSource, utmMedium, utmCampaign, notes } = req.body as {
        name: string; platform: string; objective?: string; budget?: number; currency?: string
        startDate?: string; endDate?: string; utmSource?: string; utmMedium?: string
        utmCampaign?: string; notes?: string
      }
      if (!name || !platform) {
        res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "name و platform مطلوبان" } })
        return
      }
      const rows = await prisma.$queryRawUnsafe<CampaignRow[]>(
        `INSERT INTO ad_campaigns
           (merchant_id, name, platform, objective, budget, currency, start_date, end_date,
            utm_source, utm_medium, utm_campaign, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        req.merchant.id, name, platform.toUpperCase(), objective.toUpperCase(),
        Number(budget), currency.toUpperCase(),
        startDate ?? null, endDate ?? null,
        utmSource ?? null, utmMedium ?? null, utmCampaign ?? null, notes ?? null
      )
      res.json({ success: true, data: mapCampaign(rows[0]) })
    } catch (err) { next(err) }
  },

  // ── Update Metrics ────────────────────────────────────────
  async updateMetrics(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params
      const { spent, impressions, clicks, conversions, revenue, status } = req.body as {
        spent?: number; impressions?: number; clicks?: number
        conversions?: number; revenue?: number; status?: string
      }
      const rows = await prisma.$queryRawUnsafe<CampaignRow[]>(
        `UPDATE ad_campaigns SET
           spent       = COALESCE($3,  spent),
           impressions = COALESCE($4,  impressions),
           clicks      = COALESCE($5,  clicks),
           conversions = COALESCE($6,  conversions),
           revenue     = COALESCE($7,  revenue),
           status      = COALESCE($8,  status),
           updated_at  = NOW()
         WHERE id = $1 AND merchant_id = $2 RETURNING *`,
        id, req.merchant.id,
        spent       !== undefined ? Number(spent)       : null,
        impressions !== undefined ? Number(impressions) : null,
        clicks      !== undefined ? Number(clicks)      : null,
        conversions !== undefined ? Number(conversions) : null,
        revenue     !== undefined ? Number(revenue)     : null,
        status?.toUpperCase() ?? null
      )
      if (rows.length === 0) { res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "الحملة غير موجودة" } }); return }
      res.json({ success: true, data: mapCampaign(rows[0]) })
    } catch (err) { next(err) }
  },

  // ── Update Status ─────────────────────────────────────────
  async updateStatus(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params
      const { status } = req.body as { status: string }
      const valid = ["DRAFT", "ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"]
      if (!valid.includes(status?.toUpperCase())) {
        res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "status غير صحيح" } })
        return
      }
      const rows = await prisma.$queryRawUnsafe<CampaignRow[]>(
        `UPDATE ad_campaigns SET status = $1, updated_at = NOW() WHERE id = $2 AND merchant_id = $3 RETURNING *`,
        status.toUpperCase(), id, req.merchant.id
      )
      res.json({ success: true, data: rows[0] ? mapCampaign(rows[0]) : null })
    } catch (err) { next(err) }
  },

  // ── Delete ────────────────────────────────────────────────
  async delete(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      await prisma.$executeRawUnsafe(
        `DELETE FROM ad_campaigns WHERE id = $1 AND merchant_id = $2`,
        req.params.id, req.merchant.id
      )
      res.json({ success: true, data: { deleted: true } })
    } catch (err) { next(err) }
  },

  // ── Platform Breakdown ────────────────────────────────────
  async getPlatformBreakdown(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT
           platform,
           COUNT(*)::int                          AS campaign_count,
           COALESCE(SUM(spent)::float,       0)   AS total_spent,
           COALESCE(SUM(impressions)::float, 0)   AS total_impressions,
           COALESCE(SUM(clicks)::float,      0)   AS total_clicks,
           COALESCE(SUM(conversions)::float, 0)   AS total_conversions,
           COALESCE(SUM(revenue)::float,     0)   AS total_revenue
         FROM ad_campaigns WHERE merchant_id = $1
         GROUP BY platform ORDER BY total_spent DESC`,
        req.merchant.id
      )
      res.json({
        success: true,
        data: rows.map(r => ({
          platform:         r.platform,
          campaignCount:    Number(r.campaign_count),
          totalSpent:       Math.round(Number(r.total_spent)       * 100) / 100,
          totalImpressions: Number(r.total_impressions),
          totalClicks:      Number(r.total_clicks),
          totalConversions: Number(r.total_conversions),
          totalRevenue:     Math.round(Number(r.total_revenue) * 100) / 100,
          roas:             Number(r.total_spent) > 0
            ? Math.round(Number(r.total_revenue) / Number(r.total_spent) * 100) / 100 : 0,
        })),
      })
    } catch (err) { next(err) }
  },
}
