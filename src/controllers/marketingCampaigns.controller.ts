// ─────────────────────────────────────────────────────────────
// src/controllers/marketingCampaigns.controller.ts
// Zyrix Backend — Marketing Automation
// Color: #EA580C
// ─────────────────────────────────────────────────────────────
import { Response, NextFunction } from "express"
import { AuthenticatedRequest } from "../types"
import { prisma } from "../config/database"

// ─── Types ────────────────────────────────────────────────────

interface CampaignRow {
  id: string; merchant_id: string; name: string; description: string | null
  type: string; status: string; target_segment: string
  message_subject: string | null; message_body: string
  scheduled_at: string | null; sent_at: string | null
  total_sent: number; total_opened: number; total_clicked: number; total_converted: number
  currency: string; created_at: string; updated_at: string
}

interface ContactRow {
  id: string; campaign_id: string; customer_id: string | null
  name: string; phone: string | null; email: string | null
  status: string; sent_at: string | null; created_at: string
}

interface StatsRow {
  total: number; draft: number; active: number
  completed: number; total_sent: number; total_opened: number; total_converted: number
}

function mapCampaign(r: CampaignRow) {
  return {
    id: r.id, name: r.name, description: r.description,
    type: r.type, status: r.status, targetSegment: r.target_segment,
    messageSubject: r.message_subject, messageBody: r.message_body,
    scheduledAt: r.scheduled_at, sentAt: r.sent_at,
    totalSent: Number(r.total_sent), totalOpened: Number(r.total_opened),
    totalClicked: Number(r.total_clicked), totalConverted: Number(r.total_converted),
    openRate: Number(r.total_sent) > 0 ? Math.round(Number(r.total_opened) / Number(r.total_sent) * 100 * 10) / 10 : 0,
    conversionRate: Number(r.total_sent) > 0 ? Math.round(Number(r.total_converted) / Number(r.total_sent) * 100 * 10) / 10 : 0,
    currency: r.currency, createdAt: r.created_at,
  }
}

// ─── Controller ──────────────────────────────────────────────

export const marketingCampaignsController = {

  // ── Stats ─────────────────────────────────────────────────
  async getStats(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const rows = await prisma.$queryRawUnsafe<StatsRow[]>(
        `SELECT
           COUNT(*)::int                                          AS total,
           COUNT(*) FILTER (WHERE status='DRAFT')::int           AS draft,
           COUNT(*) FILTER (WHERE status='ACTIVE')::int          AS active,
           COUNT(*) FILTER (WHERE status='COMPLETED')::int       AS completed,
           COALESCE(SUM(total_sent)::int, 0)                     AS total_sent,
           COALESCE(SUM(total_opened)::int, 0)                   AS total_opened,
           COALESCE(SUM(total_converted)::int, 0)                AS total_converted
         FROM marketing_campaigns WHERE merchant_id = $1`,
        req.merchant.id
      )
      const r = rows[0]
      res.json({
        success: true,
        data: {
          total: Number(r?.total || 0), draft: Number(r?.draft || 0),
          active: Number(r?.active || 0), completed: Number(r?.completed || 0),
          totalSent: Number(r?.total_sent || 0), totalOpened: Number(r?.total_opened || 0),
          totalConverted: Number(r?.total_converted || 0),
          avgOpenRate: Number(r?.total_sent || 0) > 0
            ? Math.round(Number(r?.total_opened || 0) / Number(r?.total_sent || 0) * 100 * 10) / 10 : 0,
        },
      })
    } catch (err) { next(err) }
  },

  // ── List Campaigns ────────────────────────────────────────
  async list(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { status, type } = req.query as Record<string, string>
      let where = `WHERE merchant_id = $1`
      const params: unknown[] = [req.merchant.id]
      let idx = 2
      if (status) { where += ` AND status = $${idx++}`; params.push(status.toUpperCase()) }
      if (type)   { where += ` AND type = $${idx++}`;   params.push(type.toUpperCase()) }

      const rows = await prisma.$queryRawUnsafe<CampaignRow[]>(
        `SELECT * FROM marketing_campaigns ${where} ORDER BY created_at DESC`,
        ...params
      )
      res.json({ success: true, data: rows.map(mapCampaign) })
    } catch (err) { next(err) }
  },

  // ── Create Campaign ───────────────────────────────────────
  async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { name, description, type, targetSegment = "ALL", messageSubject, messageBody, scheduledAt } = req.body as {
        name: string; description?: string; type: string; targetSegment?: string
        messageSubject?: string; messageBody: string; scheduledAt?: string
      }
      if (!name || !type || !messageBody) {
        res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "name, type, messageBody مطلوبة" } })
        return
      }
      const rows = await prisma.$queryRawUnsafe<CampaignRow[]>(
        `INSERT INTO marketing_campaigns (merchant_id, name, description, type, target_segment, message_subject, message_body, scheduled_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        req.merchant.id, name, description ?? null, type.toUpperCase(),
        targetSegment, messageSubject ?? null, messageBody, scheduledAt ?? null
      )
      res.json({ success: true, data: mapCampaign(rows[0]) })
    } catch (err) { next(err) }
  },

  // ── Update Campaign ───────────────────────────────────────
  async update(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params
      const { name, description, messageSubject, messageBody, scheduledAt, targetSegment } = req.body
      const rows = await prisma.$queryRawUnsafe<CampaignRow[]>(
        `UPDATE marketing_campaigns SET
           name            = COALESCE($3, name),
           description     = COALESCE($4, description),
           message_subject = COALESCE($5, message_subject),
           message_body    = COALESCE($6, message_body),
           scheduled_at    = COALESCE($7, scheduled_at),
           target_segment  = COALESCE($8, target_segment),
           updated_at      = NOW()
         WHERE id = $1 AND merchant_id = $2 RETURNING *`,
        id, req.merchant.id,
        name ?? null, description ?? null, messageSubject ?? null,
        messageBody ?? null, scheduledAt ?? null, targetSegment ?? null
      )
      if (rows.length === 0) { res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "الحملة غير موجودة" } }); return }
      res.json({ success: true, data: mapCampaign(rows[0]) })
    } catch (err) { next(err) }
  },

  // ── Launch Campaign ───────────────────────────────────────
  async launch(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params

      // جلب الحملة
      const campaigns = await prisma.$queryRawUnsafe<CampaignRow[]>(
        `SELECT * FROM marketing_campaigns WHERE id = $1 AND merchant_id = $2`,
        id, req.merchant.id
      )
      if (campaigns.length === 0) { res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "الحملة غير موجودة" } }); return }

      const campaign = campaigns[0]
      if (campaign.status !== "DRAFT" && campaign.status !== "PAUSED") {
        res.status(400).json({ success: false, error: { code: "INVALID_STATUS", message: "يمكن إطلاق الحملات في حالة DRAFT أو PAUSED فقط" } })
        return
      }

      // جلب العملاء حسب الـ segment
      let customers: { id: string; name: string; phone: string | null; email: string | null }[] = []
      if (campaign.target_segment === "ALL") {
        customers = await prisma.$queryRawUnsafe(
          `SELECT id, name, phone, email FROM customers WHERE merchant_id = $1 LIMIT 1000`,
          req.merchant.id
        )
      } else if (campaign.target_segment === "LOYAL") {
        customers = await prisma.$queryRawUnsafe(
          `SELECT c.id, c.name, c.phone, c.email FROM customers c
           JOIN loyalty_customers lc ON lc.customer_id = c.id
           WHERE c.merchant_id = $1 AND lc.active_points > 0 LIMIT 500`,
          req.merchant.id
        )
      } else {
        customers = await prisma.$queryRawUnsafe(
          `SELECT id, name, phone, email FROM customers WHERE merchant_id = $1 LIMIT 1000`,
          req.merchant.id
        )
      }

      // إنشاء campaign_contacts
      for (const c of customers) {
        await prisma.$executeRawUnsafe(
          `INSERT INTO campaign_contacts (campaign_id, customer_id, name, phone, email)
           VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
          id, c.id, c.name, c.phone ?? null, c.email ?? null
        )
      }

      // تحديث الحملة
      const rows = await prisma.$queryRawUnsafe<CampaignRow[]>(
        `UPDATE marketing_campaigns SET
           status     = 'ACTIVE',
           sent_at    = NOW(),
           total_sent = $2,
           updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        id, customers.length
      )

      res.json({ success: true, data: { ...mapCampaign(rows[0]), contactsReached: customers.length } })
    } catch (err) { next(err) }
  },

  // ── Pause / Cancel ────────────────────────────────────────
  async updateStatus(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params
      const { status } = req.body as { status: string }
      const valid = ["PAUSED", "CANCELLED", "COMPLETED"]
      if (!valid.includes(status?.toUpperCase())) {
        res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "status غير صحيح" } })
        return
      }
      const rows = await prisma.$queryRawUnsafe<CampaignRow[]>(
        `UPDATE marketing_campaigns SET status = $1, updated_at = NOW() WHERE id = $2 AND merchant_id = $3 RETURNING *`,
        status.toUpperCase(), id, req.merchant.id
      )
      res.json({ success: true, data: rows[0] ? mapCampaign(rows[0]) : null })
    } catch (err) { next(err) }
  },

  // ── Delete ────────────────────────────────────────────────
  async delete(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      await prisma.$executeRawUnsafe(
        `DELETE FROM marketing_campaigns WHERE id = $1 AND merchant_id = $2`,
        req.params.id, req.merchant.id
      )
      res.json({ success: true, data: { deleted: true } })
    } catch (err) { next(err) }
  },

  // ── Get Contacts ──────────────────────────────────────────
  async getContacts(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params
      const rows = await prisma.$queryRawUnsafe<ContactRow[]>(
        `SELECT cc.* FROM campaign_contacts cc
         JOIN marketing_campaigns mc ON mc.id = cc.campaign_id
         WHERE cc.campaign_id = $1 AND mc.merchant_id = $2
         ORDER BY cc.created_at DESC LIMIT 100`,
        id, req.merchant.id
      )
      res.json({ success: true, data: rows.map(r => ({ id: r.id, name: r.name, phone: r.phone, email: r.email, status: r.status, sentAt: r.sent_at })) })
    } catch (err) { next(err) }
  },
}
