import { Request, Response } from "express";
import { prisma } from "../config/database";
import { AuthenticatedRequest } from "../types";

// ─── Channels ────────────────────────────────────────────────

export const getChannels = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const rows = await prisma.$queryRawUnsafe(
      `SELECT * FROM notification_channels WHERE merchant_id = $1 ORDER BY channel`,
      merchantId
    ) as any[];
    res.json({ success: true, data: { channels: rows } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to get channels" });
    return;
  }
};

export const upsertChannel = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { channel, enabled, config } = req.body;
    await prisma.$queryRawUnsafe(
      `INSERT INTO notification_channels (merchant_id, channel, enabled, config)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (merchant_id, channel) DO UPDATE
       SET enabled = $3, config = $4`,
      merchantId, channel, enabled ?? true, JSON.stringify(config ?? {})
    );
    res.json({ success: true });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to update channel" });
    return;
  }
};

// ─── Templates ───────────────────────────────────────────────

export const getTemplates = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const rows = await prisma.$queryRawUnsafe(
      `SELECT * FROM notification_templates WHERE merchant_id = $1 ORDER BY created_at DESC`,
      merchantId
    ) as any[];
    res.json({ success: true, data: { templates: rows } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to get templates" });
    return;
  }
};

export const createTemplate = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { name, event_type, channel, subject, body_ar, body_en } = req.body;
    const rows = await prisma.$queryRawUnsafe(
      `INSERT INTO notification_templates (merchant_id, name, event_type, channel, subject, body_ar, body_en)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      merchantId, name, event_type, channel, subject ?? null, body_ar, body_en
    ) as any[];
    res.json({ success: true, data: { template: rows[0] } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to create template" });
    return;
  }
};

export const updateTemplate = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { id } = req.params;
    const { name, subject, body_ar, body_en, active } = req.body;
    await prisma.$queryRawUnsafe(
      `UPDATE notification_templates
       SET name=$1, subject=$2, body_ar=$3, body_en=$4, active=$5
       WHERE id=$6 AND merchant_id=$7`,
      name, subject ?? null, body_ar, body_en, active ?? true, id, merchantId
    );
    res.json({ success: true });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to update template" });
    return;
  }
};

export const deleteTemplate = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { id } = req.params;
    await prisma.$queryRawUnsafe(
      `DELETE FROM notification_templates WHERE id=$1 AND merchant_id=$2`,
      id, merchantId
    );
    res.json({ success: true });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to delete template" });
    return;
  }
};

// ─── Send / Logs ─────────────────────────────────────────────

export const sendNotification = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { channel, event_type, recipient, metadata } = req.body;
    await prisma.$queryRawUnsafe(
      `INSERT INTO notification_logs (merchant_id, channel, event_type, recipient, status, metadata)
       VALUES ($1,$2,$3,$4,'sent',$5)`,
      merchantId, channel, event_type, recipient, JSON.stringify(metadata ?? {})
    );
    res.json({ success: true, data: { message: "Notification queued" } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to send notification" });
    return;
  }
};

export const getLogs = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const limit = Number(req.query.limit ?? 50);
    const rows = await prisma.$queryRawUnsafe(
      `SELECT * FROM notification_logs WHERE merchant_id=$1 ORDER BY sent_at DESC LIMIT $2`,
      merchantId, limit
    ) as any[];
    const stats = await prisma.$queryRawUnsafe(
      `SELECT channel, COUNT(*)::int as total,
              SUM(CASE WHEN status='delivered' THEN 1 ELSE 0 END)::int as delivered,
              SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END)::int as failed
       FROM notification_logs WHERE merchant_id=$1
       GROUP BY channel`,
      merchantId
    ) as any[];
    res.json({ success: true, data: { logs: rows, stats } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to get logs" });
    return;
  }
};
