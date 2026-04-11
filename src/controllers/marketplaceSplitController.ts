import { Request, Response } from "express";
import { prisma } from "../config/database";
import { AuthenticatedRequest } from "../types";

// ─── Vendors ─────────────────────────────────────────────────

export const getVendors = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const rows = await prisma.$queryRawUnsafe(
      `SELECT id, merchant_id, name, email, phone, commission_rate::float,
              status, total_sales::float, total_payouts::float, pending_balance::float, created_at
       FROM marketplace_vendors WHERE merchant_id=$1 ORDER BY created_at DESC`, merchantId
    ) as any[];
    const stats = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int as total_vendors,
              SUM(total_sales)::float as total_gmv,
              SUM(pending_balance)::float as total_pending
       FROM marketplace_vendors WHERE merchant_id=$1`, merchantId
    ) as any[];
    res.json({ success: true, data: { vendors: rows, stats: stats[0] } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to get vendors" });
    return;
  }
};

export const createVendor = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { name, email, phone, iban, commission_rate } = req.body;
    const rows = await prisma.$queryRawUnsafe(
      `INSERT INTO marketplace_vendors (merchant_id, name, email, phone, iban, commission_rate)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      merchantId, name, email, phone ?? null, iban ?? null, Number(commission_rate ?? 0)
    ) as any[];
    res.json({ success: true, data: { vendor: rows[0] } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to create vendor" });
    return;
  }
};

export const updateVendor = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { id } = req.params;
    const { name, email, phone, iban, commission_rate, status } = req.body;
    await prisma.$queryRawUnsafe(
      `UPDATE marketplace_vendors
       SET name=$1, email=$2, phone=$3, iban=$4, commission_rate=$5, status=$6
       WHERE id=$7 AND merchant_id=$8`,
      name, email, phone ?? null, iban ?? null,
      Number(commission_rate ?? 0), status ?? 'active', id, merchantId
    );
    res.json({ success: true });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to update vendor" });
    return;
  }
};

export const deleteVendor = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { id } = req.params;
    await prisma.$queryRawUnsafe(
      `DELETE FROM marketplace_vendors WHERE id=$1 AND merchant_id=$2`, id, merchantId
    );
    res.json({ success: true });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to delete vendor" });
    return;
  }
};

// ─── Split Rules ─────────────────────────────────────────────

export const getSplitRules = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const rows = await prisma.$queryRawUnsafe(
      `SELECT * FROM split_rules WHERE merchant_id=$1 ORDER BY created_at DESC`, merchantId
    ) as any[];
    res.json({ success: true, data: { rules: rows } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to get split rules" });
    return;
  }
};

export const createSplitRule = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { name, type, splits } = req.body;
    const rows = await prisma.$queryRawUnsafe(
      `INSERT INTO split_rules (merchant_id, name, type, splits)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      merchantId, name, type ?? 'PERCENTAGE', JSON.stringify(splits ?? [])
    ) as any[];
    res.json({ success: true, data: { rule: rows[0] } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to create split rule" });
    return;
  }
};

export const deleteSplitRule = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { id } = req.params;
    await prisma.$queryRawUnsafe(
      `DELETE FROM split_rules WHERE id=$1 AND merchant_id=$2`, id, merchantId
    );
    res.json({ success: true });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to delete split rule" });
    return;
  }
};

// ─── Process Split ────────────────────────────────────────────

export const processSplit = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { rule_id, transaction_id, gross_amount, vendor_id } = req.body;
    const ruleRows = await prisma.$queryRawUnsafe(
      `SELECT * FROM split_rules WHERE id=$1 AND merchant_id=$2`, rule_id, merchantId
    ) as any[];
    if (!ruleRows.length) {
      res.status(404).json({ success: false, error: "Rule not found" });
      return;
    }
    const rule = ruleRows[0];
    const splits: any[] = Array.isArray(rule.splits) ? rule.splits : JSON.parse(rule.splits ?? '[]');
    const gross = Number(gross_amount);
    const results: any[] = [];
    for (const split of splits) {
      const amount = rule.type === 'PERCENTAGE'
        ? (gross * Number(split.value)) / 100
        : Number(split.value);
      const platform_fee = gross - amount;
      const log = await prisma.$queryRawUnsafe(
        `INSERT INTO split_logs (merchant_id, rule_id, transaction_id, vendor_id, gross_amount, split_amount, platform_fee)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        merchantId, rule_id, transaction_id ?? null,
        split.vendor_id ?? vendor_id ?? null, gross, amount, platform_fee
      ) as any[];
      if (split.vendor_id || vendor_id) {
        await prisma.$queryRawUnsafe(
          `UPDATE marketplace_vendors
           SET total_sales = total_sales + $1, pending_balance = pending_balance + $2
           WHERE id=$3`,
          gross, amount, split.vendor_id ?? vendor_id
        );
      }
      results.push(log[0]);
    }
    res.json({ success: true, data: { splits: results } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to process split" });
    return;
  }
};

export const getSplitLogs = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const limit = Number(req.query.limit ?? 50);
    const rows = await prisma.$queryRawUnsafe(
      `SELECT l.*, v.name as vendor_name
       FROM split_logs l
       LEFT JOIN marketplace_vendors v ON v.id = l.vendor_id
       WHERE l.merchant_id=$1 ORDER BY l.created_at DESC LIMIT $2`,
      merchantId, limit
    ) as any[];
    res.json({ success: true, data: { logs: rows } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to get split logs" });
    return;
  }
};
