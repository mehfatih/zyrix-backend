import { Request, Response } from "express";
import { prisma } from "../config/database";
import { AuthenticatedRequest } from "../types";

// ─── Affiliates ───────────────────────────────────────────────

export const getAffiliates = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const rows = await prisma.$queryRawUnsafe(
      `SELECT id, merchant_id, name, email, phone, referral_code, commission_type,
              commission_value::float, status, total_referrals::int, total_revenue::float,
              total_commission::float, pending_payout::float, created_at
       FROM affiliates WHERE merchant_id=$1 ORDER BY created_at DESC`,
      merchantId
    ) as any[];
    const stats = await prisma.$queryRawUnsafe(
      `SELECT
        COUNT(*)::int as total_affiliates,
        SUM(total_referrals)::int as total_referrals,
        SUM(total_revenue)::float as total_revenue,
        SUM(total_commission)::float as total_commission,
        SUM(pending_payout)::float as pending_payout
       FROM affiliates WHERE merchant_id=$1`,
      merchantId
    ) as any[];
    res.json({ success: true, data: { affiliates: rows, stats: stats[0] } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to get affiliates" });
    return;
  }
};

export const createAffiliate = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { name, email, phone, commission_type, commission_value } = req.body;
    const referral_code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const rows = await prisma.$queryRawUnsafe(
      `INSERT INTO affiliates (merchant_id, name, email, phone, referral_code, commission_type, commission_value)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      merchantId, name, email, phone ?? null,
      referral_code, commission_type ?? 'PERCENTAGE',
      Number(commission_value ?? 5)
    ) as any[];
    res.json({ success: true, data: { affiliate: rows[0] } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to create affiliate" });
    return;
  }
};

export const updateAffiliate = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { id } = req.params;
    const { name, email, phone, commission_type, commission_value, status } = req.body;
    await prisma.$queryRawUnsafe(
      `UPDATE affiliates
       SET name=$1, email=$2, phone=$3, commission_type=$4, commission_value=$5, status=$6
       WHERE id=$7 AND merchant_id=$8`,
      name, email, phone ?? null, commission_type, Number(commission_value),
      status ?? 'active', id, merchantId
    );
    res.json({ success: true });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to update affiliate" });
    return;
  }
};

export const deleteAffiliate = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { id } = req.params;
    await prisma.$queryRawUnsafe(
      `DELETE FROM affiliates WHERE id=$1 AND merchant_id=$2`,
      id, merchantId
    );
    res.json({ success: true });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to delete affiliate" });
    return;
  }
};

// ─── Referrals ────────────────────────────────────────────────

export const getReferrals = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { affiliateId } = req.params;
    const rows = await prisma.$queryRawUnsafe(
      `SELECT r.*, a.name as affiliate_name
       FROM affiliate_referrals r
       JOIN affiliates a ON a.id = r.affiliate_id
       WHERE r.merchant_id=$1 AND r.affiliate_id=$2
       ORDER BY r.referred_at DESC`,
      merchantId, affiliateId
    ) as any[];
    res.json({ success: true, data: { referrals: rows } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to get referrals" });
    return;
  }
};

export const trackReferral = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { referral_code, transaction_id, customer_phone, revenue } = req.body;
    const affiliates = await prisma.$queryRawUnsafe(
      `SELECT * FROM affiliates WHERE referral_code=$1 AND merchant_id=$2 AND status='active'`,
      referral_code, merchantId
    ) as any[];
    if (!affiliates.length) {
      res.status(404).json({ success: false, error: "Invalid referral code" });
      return;
    }
    const affiliate = affiliates[0];
    let commission = 0;
    if (affiliate.commission_type === 'PERCENTAGE') {
      commission = (Number(revenue) * Number(affiliate.commission_value)) / 100;
    } else if (affiliate.commission_type === 'FIXED') {
      commission = Number(affiliate.commission_value);
    }
    const rows = await prisma.$queryRawUnsafe(
      `INSERT INTO affiliate_referrals
       (merchant_id, affiliate_id, transaction_id, customer_phone, revenue, commission, status)
       VALUES ($1,$2,$3,$4,$5,$6,'pending') RETURNING *`,
      merchantId, affiliate.id, transaction_id ?? null,
      customer_phone ?? null, Number(revenue ?? 0), commission
    ) as any[];
    await prisma.$queryRawUnsafe(
      `UPDATE affiliates
       SET total_referrals = total_referrals + 1,
           total_revenue = total_revenue + $1,
           total_commission = total_commission + $2,
           pending_payout = pending_payout + $2
       WHERE id=$3`,
      Number(revenue ?? 0), commission, affiliate.id
    );
    res.json({ success: true, data: { referral: rows[0], commission } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to track referral" });
    return;
  }
};

export const approveReferral = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { id } = req.params;
    await prisma.$queryRawUnsafe(
      `UPDATE affiliate_referrals SET status='approved' WHERE id=$1 AND merchant_id=$2`,
      id, merchantId
    );
    res.json({ success: true });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to approve referral" });
    return;
  }
};

// ─── Payouts ─────────────────────────────────────────────────

export const getPayouts = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const rows = await prisma.$queryRawUnsafe(
      `SELECT p.*, a.name as affiliate_name
       FROM affiliate_payouts p
       JOIN affiliates a ON a.id = p.affiliate_id
       WHERE p.merchant_id=$1 ORDER BY p.created_at DESC`,
      merchantId
    ) as any[];
    res.json({ success: true, data: { payouts: rows } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to get payouts" });
    return;
  }
};

export const createPayout = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { affiliate_id, amount, method, notes } = req.body;
    const rows = await prisma.$queryRawUnsafe(
      `INSERT INTO affiliate_payouts (merchant_id, affiliate_id, amount, method, notes)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      merchantId, affiliate_id, Number(amount), method ?? 'BANK_TRANSFER', notes ?? null
    ) as any[];
    await prisma.$queryRawUnsafe(
      `UPDATE affiliates SET pending_payout = pending_payout - $1 WHERE id=$2`,
      Number(amount), affiliate_id
    );
    res.json({ success: true, data: { payout: rows[0] } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to create payout" });
    return;
  }
};

export const completePayout = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { id } = req.params;
    await prisma.$queryRawUnsafe(
      `UPDATE affiliate_payouts SET status='completed', paid_at=NOW() WHERE id=$1 AND merchant_id=$2`,
      id, merchantId
    );
    res.json({ success: true });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to complete payout" });
    return;
  }
};
