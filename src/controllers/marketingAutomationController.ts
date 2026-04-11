import { Request, Response } from "express";
import { prisma } from "../config/database";
import { AuthenticatedRequest } from "../types";

// ─── Campaigns ───────────────────────────────────────────────

export const getCampaigns = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { status } = req.query;
    let query = `SELECT * FROM marketing_campaigns WHERE merchant_id=$1`;
    const params: any[] = [merchantId];
    if (status) { query += ` AND status=$2`; params.push(status); }
    query += ` ORDER BY created_at DESC`;
    const rows = await prisma.$queryRawUnsafe(query, ...params) as any[];
    const stats = await prisma.$queryRawUnsafe(
      `SELECT
        COUNT(*)::int as total,
        SUM(sent_count)::int as total_sent,
        SUM(open_count)::int as total_opens,
        SUM(click_count)::int as total_clicks,
        SUM(conversion_count)::int as total_conversions,
        CASE WHEN SUM(sent_count) > 0
             THEN ROUND(SUM(open_count)*100.0/NULLIF(SUM(sent_count),0),1)
             ELSE 0 END as avg_open_rate
       FROM marketing_campaigns WHERE merchant_id=$1`,
      merchantId
    ) as any[];
    res.json({ success: true, data: { campaigns: rows, stats: stats[0] } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to get campaigns" });
    return;
  }
};

export const createCampaign = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { name, type, target_segment, trigger_type, trigger_config, content_ar, content_en, subject, scheduled_at } = req.body;
    const rows = await prisma.$queryRawUnsafe(
      `INSERT INTO marketing_campaigns
       (merchant_id, name, type, target_segment, trigger_type, trigger_config, content_ar, content_en, subject, scheduled_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      merchantId, name, type ?? 'PUSH',
      target_segment ?? null, trigger_type ?? 'MANUAL',
      JSON.stringify(trigger_config ?? {}),
      content_ar ?? null, content_en ?? null,
      subject ?? null, scheduled_at ?? null
    ) as any[];
    res.json({ success: true, data: { campaign: rows[0] } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to create campaign" });
    return;
  }
};

export const updateCampaign = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { id } = req.params;
    const { name, status, content_ar, content_en, subject, scheduled_at, trigger_config } = req.body;
    await prisma.$queryRawUnsafe(
      `UPDATE marketing_campaigns
       SET name=$1, status=$2, content_ar=$3, content_en=$4, subject=$5,
           scheduled_at=$6, trigger_config=$7, updated_at=NOW()
       WHERE id=$8 AND merchant_id=$9`,
      name, status ?? 'draft', content_ar ?? null, content_en ?? null,
      subject ?? null, scheduled_at ?? null,
      JSON.stringify(trigger_config ?? {}), id, merchantId
    );
    res.json({ success: true });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to update campaign" });
    return;
  }
};

export const deleteCampaign = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { id } = req.params;
    await prisma.$queryRawUnsafe(
      `DELETE FROM marketing_campaigns WHERE id=$1 AND merchant_id=$2`,
      id, merchantId
    );
    res.json({ success: true });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to delete campaign" });
    return;
  }
};

export const sendCampaign = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { id } = req.params;
    const { recipients_count } = req.body;
    await prisma.$queryRawUnsafe(
      `UPDATE marketing_campaigns
       SET status='active', sent_count=$1, updated_at=NOW()
       WHERE id=$2 AND merchant_id=$3`,
      Number(recipients_count ?? 0), id, merchantId
    );
    const eventRows = await prisma.$queryRawUnsafe(
      `INSERT INTO marketing_events (merchant_id, campaign_id, event_type, recipient)
       VALUES ($1,$2,'CAMPAIGN_SENT','bulk') RETURNING *`,
      merchantId, id
    ) as any[];
    res.json({ success: true, data: { message: "Campaign sent", event: eventRows[0] } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to send campaign" });
    return;
  }
};

// ─── Automations ─────────────────────────────────────────────

export const getAutomations = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const rows = await prisma.$queryRawUnsafe(
      `SELECT * FROM marketing_automations WHERE merchant_id=$1 ORDER BY created_at DESC`,
      merchantId
    ) as any[];
    res.json({ success: true, data: { automations: rows } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to get automations" });
    return;
  }
};

export const createAutomation = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { name, trigger_event, conditions, actions } = req.body;
    const rows = await prisma.$queryRawUnsafe(
      `INSERT INTO marketing_automations (merchant_id, name, trigger_event, conditions, actions)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      merchantId, name, trigger_event,
      JSON.stringify(conditions ?? []),
      JSON.stringify(actions ?? [])
    ) as any[];
    res.json({ success: true, data: { automation: rows[0] } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to create automation" });
    return;
  }
};

export const toggleAutomation = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { id } = req.params;
    await prisma.$queryRawUnsafe(
      `UPDATE marketing_automations SET active = NOT active WHERE id=$1 AND merchant_id=$2`,
      id, merchantId
    );
    res.json({ success: true });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to toggle automation" });
    return;
  }
};

export const deleteAutomation = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { id } = req.params;
    await prisma.$queryRawUnsafe(
      `DELETE FROM marketing_automations WHERE id=$1 AND merchant_id=$2`,
      id, merchantId
    );
    res.json({ success: true });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to delete automation" });
    return;
  }
};

// ─── Events ───────────────────────────────────────────────────

export const trackEvent = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { campaign_id, automation_id, event_type, recipient, metadata } = req.body;
    await prisma.$queryRawUnsafe(
      `INSERT INTO marketing_events (merchant_id, campaign_id, automation_id, event_type, recipient, metadata)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      merchantId, campaign_id ?? null, automation_id ?? null,
      event_type, recipient, JSON.stringify(metadata ?? {})
    );
    if (campaign_id) {
      const field = event_type === 'OPEN' ? 'open_count' : event_type === 'CLICK' ? 'click_count' : event_type === 'CONVERSION' ? 'conversion_count' : null;
      if (field) {
        await prisma.$queryRawUnsafe(
          `UPDATE marketing_campaigns SET ${field} = ${field} + 1 WHERE id=$1`,
          campaign_id
        );
      }
    }
    res.json({ success: true });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to track event" });
    return;
  }
};
