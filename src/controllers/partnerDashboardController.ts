import { Request, Response } from "express";
import { prisma } from "../config/database";
import { AuthenticatedRequest } from "../types";

export const getPartners = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const rows = await prisma.$queryRawUnsafe(
      `SELECT id, merchant_id, name, email, type, status,
              commission_rate::float, total_merchants::int,
              total_revenue::float, total_commission::float, created_at
       FROM partners WHERE merchant_id=$1 ORDER BY created_at DESC`, merchantId
    ) as any[];
    const stats = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int as total_partners,
              SUM(total_merchants)::int as total_sub_merchants,
              SUM(total_revenue)::float as total_gmv,
              SUM(total_commission)::float as total_commission
       FROM partners WHERE merchant_id=$1`, merchantId
    ) as any[];
    res.json({ success: true, data: { partners: rows, stats: stats[0] } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to get partners" });
    return;
  }
};

export const createPartner = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { name, email, type, commission_rate } = req.body;
    const access_token = Math.random().toString(36).substring(2, 18).toUpperCase();
    const rows = await prisma.$queryRawUnsafe(
      `INSERT INTO partners (merchant_id, name, email, type, commission_rate, access_token)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      merchantId, name, email, type ?? 'RESELLER',
      Number(commission_rate ?? 10), access_token
    ) as any[];
    res.json({ success: true, data: { partner: rows[0] } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to create partner" });
    return;
  }
};

export const updatePartner = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { id } = req.params;
    const { name, email, type, commission_rate, status } = req.body;
    await prisma.$queryRawUnsafe(
      `UPDATE partners SET name=$1, email=$2, type=$3, commission_rate=$4, status=$5
       WHERE id=$6 AND merchant_id=$7`,
      name, email, type, Number(commission_rate), status ?? 'active', id, merchantId
    );
    res.json({ success: true });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to update partner" });
    return;
  }
};

export const deletePartner = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { id } = req.params;
    await prisma.$queryRawUnsafe(
      `DELETE FROM partners WHERE id=$1 AND merchant_id=$2`, id, merchantId
    );
    res.json({ success: true });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to delete partner" });
    return;
  }
};

export const getPartnerMetrics = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { id } = req.params;
    const metrics = await prisma.$queryRawUnsafe(
      `SELECT * FROM partner_metrics WHERE partner_id=$1 ORDER BY recorded_at DESC LIMIT 12`, id
    ) as any[];
    const subMerchants = await prisma.$queryRawUnsafe(
      `SELECT * FROM partner_sub_merchants WHERE partner_id=$1 ORDER BY onboarded_at DESC`, id
    ) as any[];
    res.json({ success: true, data: { metrics, subMerchants } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to get partner metrics" });
    return;
  }
};

export const recordMetric = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { period, gmv, transactions, new_merchants, commission_earned } = req.body;
    const rows = await prisma.$queryRawUnsafe(
      `INSERT INTO partner_metrics (partner_id, merchant_id, period, gmv, transactions, new_merchants, commission_earned)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      id, merchantId, period, Number(gmv ?? 0), Number(transactions ?? 0),
      Number(new_merchants ?? 0), Number(commission_earned ?? 0)
    ) as any[];
    await prisma.$queryRawUnsafe(
      `UPDATE partners
       SET total_revenue = total_revenue + $1,
           total_commission = total_commission + $2,
           total_merchants = total_merchants + $3
       WHERE id=$4`,
      Number(gmv ?? 0), Number(commission_earned ?? 0), Number(new_merchants ?? 0), id
    );
    res.json({ success: true, data: { metric: rows[0] } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to record metric" });
    return;
  }
};

export const addSubMerchant = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { sub_merchant_name, sub_merchant_email } = req.body;
    const rows = await prisma.$queryRawUnsafe(
      `INSERT INTO partner_sub_merchants (partner_id, sub_merchant_name, sub_merchant_email)
       VALUES ($1,$2,$3) RETURNING *`,
      id, sub_merchant_name, sub_merchant_email
    ) as any[];
    await prisma.$queryRawUnsafe(
      `UPDATE partners SET total_merchants = total_merchants + 1 WHERE id=$1`, id
    );
    res.json({ success: true, data: { subMerchant: rows[0] } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to add sub-merchant" });
    return;
  }
};
