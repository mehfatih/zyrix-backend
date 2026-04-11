import { Request, Response } from "express";
import { prisma } from "../config/database";
import { AuthenticatedRequest } from "../types";

// ─── Rules ───────────────────────────────────────────────────

export const getRules = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const rows = await prisma.$queryRawUnsafe(
      `SELECT * FROM payment_reminder_rules WHERE merchant_id=$1 ORDER BY trigger_days ASC`,
      merchantId
    ) as any[];
    res.json({ success: true, data: { rules: rows } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to get rules" });
    return;
  }
};

export const createRule = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { name, trigger_type, trigger_days, channel, message_ar, message_en } = req.body;
    const rows = await prisma.$queryRawUnsafe(
      `INSERT INTO payment_reminder_rules
       (merchant_id, name, trigger_type, trigger_days, channel, message_ar, message_en)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      merchantId, name, trigger_type, Number(trigger_days ?? 0), channel ?? 'PUSH', message_ar, message_en
    ) as any[];
    res.json({ success: true, data: { rule: rows[0] } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to create rule" });
    return;
  }
};

export const updateRule = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { id } = req.params;
    const { name, trigger_type, trigger_days, channel, message_ar, message_en, active } = req.body;
    await prisma.$queryRawUnsafe(
      `UPDATE payment_reminder_rules
       SET name=$1, trigger_type=$2, trigger_days=$3, channel=$4,
           message_ar=$5, message_en=$6, active=$7
       WHERE id=$8 AND merchant_id=$9`,
      name, trigger_type, Number(trigger_days ?? 0), channel, message_ar, message_en,
      active ?? true, id, merchantId
    );
    res.json({ success: true });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to update rule" });
    return;
  }
};

export const deleteRule = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { id } = req.params;
    await prisma.$queryRawUnsafe(
      `DELETE FROM payment_reminder_rules WHERE id=$1 AND merchant_id=$2`,
      id, merchantId
    );
    res.json({ success: true });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to delete rule" });
    return;
  }
};

// ─── Sequences ───────────────────────────────────────────────

export const getSequences = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const rows = await prisma.$queryRawUnsafe(
      `SELECT * FROM payment_reminder_sequences WHERE merchant_id=$1 ORDER BY created_at DESC`,
      merchantId
    ) as any[];
    res.json({ success: true, data: { sequences: rows } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to get sequences" });
    return;
  }
};

export const createSequence = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { name, description, steps } = req.body;
    const rows = await prisma.$queryRawUnsafe(
      `INSERT INTO payment_reminder_sequences (merchant_id, name, description, steps)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      merchantId, name, description ?? null, JSON.stringify(steps ?? [])
    ) as any[];
    res.json({ success: true, data: { sequence: rows[0] } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to create sequence" });
    return;
  }
};

export const deleteSequence = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { id } = req.params;
    await prisma.$queryRawUnsafe(
      `DELETE FROM payment_reminder_sequences WHERE id=$1 AND merchant_id=$2`,
      id, merchantId
    );
    res.json({ success: true });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to delete sequence" });
    return;
  }
};

// ─── Send & Logs ─────────────────────────────────────────────

export const sendReminder = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { rule_id, sequence_id, invoice_id, subscription_id, recipient_phone, recipient_email, channel } = req.body;
    await prisma.$queryRawUnsafe(
      `INSERT INTO payment_reminder_logs
       (merchant_id, rule_id, sequence_id, invoice_id, subscription_id, recipient_phone, recipient_email, channel)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      merchantId, rule_id ?? null, sequence_id ?? null,
      invoice_id ?? null, subscription_id ?? null,
      recipient_phone ?? null, recipient_email ?? null, channel ?? 'PUSH'
    );
    res.json({ success: true, data: { message: "Reminder sent" } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to send reminder" });
    return;
  }
};

export const getLogs = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const limit = Number(req.query.limit ?? 50);
    const rows = await prisma.$queryRawUnsafe(
      `SELECT * FROM payment_reminder_logs WHERE merchant_id=$1 ORDER BY sent_at DESC LIMIT $2`,
      merchantId, limit
    ) as any[];
    const stats = await prisma.$queryRawUnsafe(
      `SELECT
        COUNT(*)::int as total_sent,
        SUM(CASE WHEN status='sent' THEN 1 ELSE 0 END)::int as sent,
        SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END)::int as failed
       FROM payment_reminder_logs WHERE merchant_id=$1`,
      merchantId
    ) as any[];
    res.json({ success: true, data: { logs: rows, stats: stats[0] } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to get logs" });
    return;
  }
};
