import { Request, Response } from "express";
import { prisma } from "../config/database";
import { AuthenticatedRequest } from "../types";

export const getExperiments = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { status } = req.query;
    let query = `SELECT * FROM growth_experiments WHERE merchant_id=$1`;
    const params: any[] = [merchantId];
    if (status) { query += ` AND status=$2`; params.push(status); }
    query += ` ORDER BY created_at DESC`;
    const rows = await prisma.$queryRawUnsafe(query, ...params) as any[];
    const stats = await prisma.$queryRawUnsafe(
      `SELECT
        COUNT(*)::int as total,
        SUM(CASE WHEN status='running' THEN 1 ELSE 0 END)::int as running,
        SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END)::int as completed
       FROM growth_experiments WHERE merchant_id=$1`, merchantId
    ) as any[];
    res.json({ success: true, data: { experiments: rows, stats: stats[0] } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to get experiments" });
    return;
  }
};

export const createExperiment = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { name, hypothesis, type, traffic_split, target_metric, start_date, end_date, variants } = req.body;
    const expRows = await prisma.$queryRawUnsafe(
      `INSERT INTO growth_experiments
       (merchant_id, name, hypothesis, type, traffic_split, target_metric, start_date, end_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      merchantId, name, hypothesis ?? null, type ?? 'FEATURE_FLAG',
      Number(traffic_split ?? 50), target_metric ?? 'conversion_rate',
      start_date ?? null, end_date ?? null
    ) as any[];
    const experiment = expRows[0];
    const variantList = Array.isArray(variants) && variants.length
      ? variants
      : [{ name: 'Control', traffic_weight: 50 }, { name: 'Variant A', traffic_weight: 50 }];
    for (const v of variantList) {
      await prisma.$queryRawUnsafe(
        `INSERT INTO experiment_variants (experiment_id, name, description, config, traffic_weight)
         VALUES ($1,$2,$3,$4,$5)`,
        experiment.id, v.name, v.description ?? null,
        JSON.stringify(v.config ?? {}), Number(v.traffic_weight ?? 50)
      );
    }
    res.json({ success: true, data: { experiment } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to create experiment" });
    return;
  }
};

export const getExperiment = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { id } = req.params;
    const expRows = await prisma.$queryRawUnsafe(
      `SELECT * FROM growth_experiments WHERE id=$1 AND merchant_id=$2`, id, merchantId
    ) as any[];
    if (!expRows.length) { res.status(404).json({ success: false, error: "Not found" }); return; }
    const variants = await prisma.$queryRawUnsafe(
      `SELECT *, CASE WHEN impressions > 0 THEN ROUND(conversions*100.0/impressions,2) ELSE 0 END as conversion_rate
       FROM experiment_variants WHERE experiment_id=$1 ORDER BY created_at ASC`, id
    ) as any[];
    res.json({ success: true, data: { experiment: expRows[0], variants } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to get experiment" });
    return;
  }
};

export const updateStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { id } = req.params;
    const { status, winner_variant } = req.body;
    await prisma.$queryRawUnsafe(
      `UPDATE growth_experiments
       SET status=$1, winner_variant=$2, updated_at=NOW()
       WHERE id=$3 AND merchant_id=$4`,
      status, winner_variant ?? null, id, merchantId
    );
    res.json({ success: true });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to update status" });
    return;
  }
};

export const deleteExperiment = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { id } = req.params;
    await prisma.$queryRawUnsafe(
      `DELETE FROM growth_experiments WHERE id=$1 AND merchant_id=$2 AND status='draft'`, id, merchantId
    );
    res.json({ success: true });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to delete experiment" });
    return;
  }
};

export const trackEvent = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { experiment_id, variant_id, event_type, session_id, value, metadata } = req.body;
    await prisma.$queryRawUnsafe(
      `INSERT INTO experiment_events (experiment_id, variant_id, merchant_id, event_type, session_id, value, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      experiment_id, variant_id, merchantId, event_type,
      session_id ?? null, Number(value ?? 0), JSON.stringify(metadata ?? {})
    );
    if (event_type === 'IMPRESSION') {
      await prisma.$queryRawUnsafe(
        `UPDATE experiment_variants SET impressions = impressions + 1 WHERE id=$1`, variant_id
      );
    } else if (event_type === 'CONVERSION') {
      await prisma.$queryRawUnsafe(
        `UPDATE experiment_variants
         SET conversions = conversions + 1, revenue = revenue + $1 WHERE id=$2`,
        Number(value ?? 0), variant_id
      );
    }
    res.json({ success: true });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to track event" });
    return;
  }
};

export const getResults = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { id } = req.params;
    const variants = await prisma.$queryRawUnsafe(
      `SELECT *,
        CASE WHEN impressions > 0 THEN ROUND(conversions*100.0/impressions,2) ELSE 0 END as conversion_rate,
        CASE WHEN conversions > 0  THEN ROUND(revenue/conversions,2) ELSE 0 END as revenue_per_conversion
       FROM experiment_variants WHERE experiment_id=$1 ORDER BY conversions DESC`, id
    ) as any[];
    const events = await prisma.$queryRawUnsafe(
      `SELECT event_type, COUNT(*)::int as count, SUM(value)::float as total_value
       FROM experiment_events WHERE experiment_id=$1 AND merchant_id=$2
       GROUP BY event_type`, id, merchantId
    ) as any[];
    res.json({ success: true, data: { variants, events } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to get results" });
    return;
  }
};
