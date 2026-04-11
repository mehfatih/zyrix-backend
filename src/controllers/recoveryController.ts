// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Revenue Recovery Controller (Elite)
// Campaigns + Auto Send + WhatsApp/Email + Stats
// ─────────────────────────────────────────────────────────────
import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types";
import { prisma } from "../config/database";

// ─── Types ───────────────────────────────────────────────────

interface CampaignRow {
  id: string;
  name: string;
  channel: string;
  trigger_type: string;
  delay_hours: number;
  message: string | null;
  is_active: boolean;
  sent_count: number;
  recovered_count: number;
  recovered_amount: number;
  created_at: string;
}

interface AttemptRow {
  id: string;
  campaign_id: string;
  campaign_name: string;
  transaction_id: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  amount: number | null;
  currency: string;
  status: string;
  sent_at: string;
  recovered_at: string | null;
}

interface FailedTxRow {
  id: string;
  transaction_id: string;
  amount: number;
  currency: string;
  customer_phone: string | null;
  customer_email: string | null;
  created_at: string;
}

interface StatsRow {
  total_sent: number;
  total_recovered: number;
  total_recovered_amount: number;
}

// ─── Default message templates ────────────────────────────────
function buildMessage(triggerType: string, channel: string, amount?: number, currency?: string): string {
  const amtStr = amount ? `${amount.toLocaleString()} ${currency ?? "SAR"}` : "";
  const templates: Record<string, Record<string, string>> = {
    FAILED_PAYMENT: {
      WHATSAPP: `مرحباً 👋 لم نتمكن من معالجة دفعتك${amtStr ? ` بمبلغ ${amtStr}` : ""}. يرجى المحاولة مرة أخرى: pay.zyrix.co`,
      EMAIL:    `عزيزي العميل، لم تكتمل عملية الدفع${amtStr ? ` بمبلغ ${amtStr}` : ""}. يمكنك إتمام الدفع من خلال الرابط أدناه.`,
      SMS:      `Zyrix: لم تكتمل دفعتك${amtStr ? ` (${amtStr})` : ""}. أكملها على: pay.zyrix.co`,
      PUSH:     `دفعتك${amtStr ? ` (${amtStr})` : ""} لم تكتمل — اضغط لإعادة المحاولة`,
    },
    ABANDONED: {
      WHATSAPP: `👋 لاحظنا أنك لم تكمل عملية الشراء${amtStr ? ` بمبلغ ${amtStr}` : ""}. العرض لا يزال متاحاً! pay.zyrix.co`,
      EMAIL:    `نسيت إتمام طلبك؟ سلتك لا تزال في انتظارك${amtStr ? ` — المبلغ ${amtStr}` : ""}.`,
      SMS:      `Zyrix: سلتك لا تزال في انتظارك. أكمل شراءك: pay.zyrix.co`,
      PUSH:     `لديك طلب غير مكتمل${amtStr ? ` (${amtStr})` : ""} — اضغط لإتمامه`,
    },
    OVERDUE_INVOICE: {
      WHATSAPP: `تذكير: فاتورتك${amtStr ? ` بمبلغ ${amtStr}` : ""} متأخرة. يرجى السداد: pay.zyrix.co`,
      EMAIL:    `تذكير بسداد الفاتورة المستحقة${amtStr ? ` بمبلغ ${amtStr}` : ""} في أقرب وقت.`,
      SMS:      `Zyrix: فاتورتك${amtStr ? ` (${amtStr})` : ""} متأخرة. ادفع الآن: pay.zyrix.co`,
      PUSH:     `فاتورة متأخرة${amtStr ? ` (${amtStr})` : ""} — اضغط للسداد`,
    },
  };
  return templates[triggerType]?.[channel] ?? `تذكير: يرجى إتمام دفعتك. pay.zyrix.co`;
}

// ─── Controller ──────────────────────────────────────────────

export const recoveryController = {
  // ─── List Campaigns ──────────────────────────────
  async listCampaigns(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const rows = await prisma.$queryRawUnsafe<CampaignRow[]>(
        `SELECT id, name, channel, trigger_type, delay_hours, message, is_active,
                sent_count, recovered_count, recovered_amount, created_at
         FROM recovery_campaigns WHERE merchant_id = $1 ORDER BY created_at DESC`,
        req.merchant.id
      );

      res.json({
        success: true,
        data: rows.map((r: CampaignRow) => ({
          id: r.id,
          name: r.name,
          channel: r.channel,
          triggerType: r.trigger_type,
          delayHours: Number(r.delay_hours),
          message: r.message,
          isActive: r.is_active,
          sentCount: Number(r.sent_count),
          recoveredCount: Number(r.recovered_count),
          recoveredAmount: Number(r.recovered_amount),
          recoveryRate: r.sent_count > 0
            ? Math.round((Number(r.recovered_count) / Number(r.sent_count)) * 100)
            : 0,
          createdAt: r.created_at,
        })),
      });
    } catch (err) { next(err); }
  },

  // ─── Create Campaign ─────────────────────────────
  async createCampaign(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { name, channel, triggerType, delayHours = 24, message } = req.body as {
        name: string; channel: string; triggerType: string;
        delayHours?: number; message?: string;
      };

      if (!name || !channel || !triggerType) {
        res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "name, channel, triggerType required" } });
        return;
      }

      const finalMessage = message ?? buildMessage(triggerType, channel);

      await prisma.$executeRawUnsafe(
        `INSERT INTO recovery_campaigns
           (merchant_id, name, channel, trigger_type, delay_hours, message)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        req.merchant.id, name, channel.toUpperCase(),
        triggerType.toUpperCase(), delayHours, finalMessage
      );

      const created = await prisma.$queryRawUnsafe<CampaignRow[]>(
        `SELECT * FROM recovery_campaigns WHERE merchant_id = $1 ORDER BY created_at DESC LIMIT 1`,
        req.merchant.id
      );

      res.status(201).json({ success: true, data: created[0] ?? null });
    } catch (err) { next(err); }
  },

  // ─── Update Campaign ─────────────────────────────
  async updateCampaign(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const existing = await prisma.$queryRawUnsafe<CampaignRow[]>(
        `SELECT id FROM recovery_campaigns WHERE id = $1 AND merchant_id = $2`,
        id, req.merchant.id
      );
      if (existing.length === 0) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Campaign not found" } });
        return;
      }
      const { isActive, message, delayHours } = req.body as { isActive?: boolean; message?: string; delayHours?: number };
      if (isActive !== undefined)
        await prisma.$executeRawUnsafe(`UPDATE recovery_campaigns SET is_active = $1, updated_at = NOW() WHERE id = $2`, isActive, id);
      if (message !== undefined)
        await prisma.$executeRawUnsafe(`UPDATE recovery_campaigns SET message = $1, updated_at = NOW() WHERE id = $2`, message, id);
      if (delayHours !== undefined)
        await prisma.$executeRawUnsafe(`UPDATE recovery_campaigns SET delay_hours = $1, updated_at = NOW() WHERE id = $2`, delayHours, id);

      res.json({ success: true, data: { updated: true } });
    } catch (err) { next(err); }
  },

  // ─── Delete Campaign ─────────────────────────────
  async deleteCampaign(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      await prisma.$executeRawUnsafe(
        `DELETE FROM recovery_campaigns WHERE id = $1 AND merchant_id = $2`,
        id, req.merchant.id
      );
      res.json({ success: true, data: { deleted: true } });
    } catch (err) { next(err); }
  },

  // ─── Send Campaign (Elite) ───────────────────────
  async sendCampaign(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const merchantId = req.merchant.id;

      const campaigns = await prisma.$queryRawUnsafe<CampaignRow[]>(
        `SELECT * FROM recovery_campaigns WHERE id = $1 AND merchant_id = $2`,
        id, merchantId
      );
      if (campaigns.length === 0) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Campaign not found" } });
        return;
      }
      const campaign = campaigns[0];

      // جلب المعاملات الفاشلة التي لم تُرسَل إليها رسالة من هذه الحملة
      const failedTx = await prisma.$queryRawUnsafe<FailedTxRow[]>(
        `SELECT t.id, t.transaction_id, t.amount, t.currency,
                t.customer_phone, t.customer_email, t.created_at
         FROM transactions t
         WHERE t.merchant_id = $1
           AND t.status = 'FAILED'
           AND t.created_at >= NOW() - INTERVAL '7 days'
           AND NOT EXISTS (
             SELECT 1 FROM recovery_attempts ra
             WHERE ra.campaign_id = $2 AND ra.transaction_id = t.transaction_id
           )
         ORDER BY t.amount DESC
         LIMIT 50`,
        merchantId, id
      );

      let sent = 0;
      for (const tx of failedTx) {
        const msg = buildMessage(campaign.trigger_type, campaign.channel, Number(tx.amount), tx.currency);
        await prisma.$executeRawUnsafe(
          `INSERT INTO recovery_attempts
             (merchant_id, campaign_id, transaction_id, customer_phone, customer_email, amount, currency, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'SENT')`,
          merchantId, id, tx.transaction_id,
          tx.customer_phone, tx.customer_email,
          tx.amount, tx.currency
        );
        sent++;
      }

      if (sent > 0) {
        await prisma.$executeRawUnsafe(
          `UPDATE recovery_campaigns SET sent_count = sent_count + $1, updated_at = NOW() WHERE id = $2`,
          sent, id
        );
      }

      res.json({
        success: true,
        data: {
          sent,
          campaignName: campaign.name,
          channel: campaign.channel,
          message: `تم إرسال ${sent} رسالة عبر ${campaign.channel}`,
        },
      });
    } catch (err) { next(err); }
  },

  // ─── Mark Recovered (Elite) ──────────────────────
  async markRecovered(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { attemptId } = req.params;
      const { amount } = req.body as { amount: number };

      const attempts = await prisma.$queryRawUnsafe<AttemptRow[]>(
        `SELECT * FROM recovery_attempts WHERE id = $1 AND merchant_id = $2`,
        attemptId, req.merchant.id
      );
      if (attempts.length === 0) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Attempt not found" } });
        return;
      }

      await prisma.$executeRawUnsafe(
        `UPDATE recovery_attempts SET status = 'RECOVERED', recovered_at = NOW() WHERE id = $1`,
        attemptId
      );

      await prisma.$executeRawUnsafe(
        `UPDATE recovery_campaigns
         SET recovered_count = recovered_count + 1,
             recovered_amount = recovered_amount + $1,
             updated_at = NOW()
         WHERE id = $2`,
        amount ?? 0, attempts[0].campaign_id
      );

      res.json({ success: true, data: { recovered: true, amount } });
    } catch (err) { next(err); }
  },

  // ─── Get Attempts ────────────────────────────────
  async getAttempts(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { campaignId } = req.params;
      const limit = parseInt(req.query.limit as string) || 20;

      const rows = await prisma.$queryRawUnsafe<AttemptRow[]>(
        `SELECT a.id, a.campaign_id, c.name AS campaign_name, a.transaction_id,
                a.customer_phone, a.customer_email, a.amount, a.currency,
                a.status, a.sent_at, a.recovered_at
         FROM recovery_attempts a
         JOIN recovery_campaigns c ON c.id = a.campaign_id
         WHERE a.merchant_id = $1 AND a.campaign_id = $2
         ORDER BY a.sent_at DESC LIMIT $3`,
        req.merchant.id, campaignId, limit
      );

      res.json({
        success: true,
        data: rows.map((r: AttemptRow) => ({
          id: r.id,
          campaignId: r.campaign_id,
          campaignName: r.campaign_name,
          transactionId: r.transaction_id,
          customerPhone: r.customer_phone,
          customerEmail: r.customer_email,
          amount: r.amount ? Number(r.amount) : null,
          currency: r.currency,
          status: r.status,
          sentAt: r.sent_at,
          recoveredAt: r.recovered_at,
        })),
      });
    } catch (err) { next(err); }
  },

  // ─── Stats (Elite) ───────────────────────────────
  async getStats(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const rows = await prisma.$queryRawUnsafe<StatsRow[]>(
        `SELECT
           COUNT(*)::int                                          AS total_sent,
           COUNT(*) FILTER (WHERE status = 'RECOVERED')::int     AS total_recovered,
           COALESCE(SUM(amount::numeric) FILTER (WHERE status = 'RECOVERED'), 0)::float AS total_recovered_amount
         FROM recovery_attempts WHERE merchant_id = $1`,
        req.merchant.id
      );

      const r = rows[0];
      res.json({
        success: true,
        data: {
          totalSent: Number(r.total_sent),
          totalRecovered: Number(r.total_recovered),
          totalRecoveredAmount: Number(r.total_recovered_amount),
          recoveryRate: r.total_sent > 0
            ? Math.round((Number(r.total_recovered) / Number(r.total_sent)) * 100)
            : 0,
        },
      });
    } catch (err) { next(err); }
  },
};
