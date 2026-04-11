import { Response } from "express";
import { prisma } from "../config/database";
import { AuthenticatedRequest } from "../types";

export const getOverview = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const merchantId = req.merchant!.id;
    const { days = "30" } = req.query as Record<string, string>;
    const since = new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000);

    const [revenueAgg, refundsAgg, feesAgg] = await Promise.all([
      prisma.transaction.aggregate({ where: { merchantId, status: "SUCCESS", createdAt: { gte: since } }, _sum: { amount: true }, _count: true }),
      prisma.refund.aggregate({ where: { merchantId, createdAt: { gte: since } }, _sum: { amount: true }, _count: true }),
      prisma.settlement.aggregate({ where: { merchantId, createdAt: { gte: since } }, _sum: { commission: true } }),
    ]);

    const gross   = Number(revenueAgg._sum.amount  ?? 0);
    const refunds = Number(refundsAgg._sum.amount  ?? 0);
    const fees    = Number(feesAgg._sum.commission ?? 0);
    const net     = gross - refunds - fees;

    res.json({ success: true, data: { gross, refunds, fees, net, transactions: revenueAgg._count, avgTransaction: revenueAgg._count > 0 ? Math.round((gross / revenueAgg._count) * 100) / 100 : 0 } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch revenue overview" });
    return;
  }
};

export const getByMethod = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const merchantId = req.merchant!.id;
    const { days = "30" } = req.query as Record<string, string>;
    const since = new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000);

    const rows = await prisma.$queryRawUnsafe<Array<{ method: string; total: string; cnt: bigint }>>(
      `SELECT method, SUM(amount)::text as total, COUNT(*) as cnt
       FROM transactions WHERE "merchantId" = $1 AND status = 'SUCCESS' AND "createdAt" >= $2
       GROUP BY method ORDER BY total::numeric DESC`,
      merchantId, since
    );

    const totalRevenue = rows.reduce((s, r) => s + Number(r.total), 0);
    res.json({ success: true, data: { methods: rows.map(r => ({ method: r.method, revenue: Number(r.total), count: Number(r.cnt), share: totalRevenue > 0 ? Math.round((Number(r.total) / totalRevenue) * 100 * 10) / 10 : 0 })), total: totalRevenue } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch by method" });
    return;
  }
};

export const getByCountry = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const merchantId = req.merchant!.id;
    const { days = "30" } = req.query as Record<string, string>;
    const since = new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000);

    const rows = await prisma.$queryRawUnsafe<Array<{ country: string; flag: string; total: string; cnt: bigint }>>(
      `SELECT country, flag, SUM(amount)::text as total, COUNT(*) as cnt
       FROM transactions WHERE "merchantId" = $1 AND status = 'SUCCESS' AND "createdAt" >= $2
       GROUP BY country, flag ORDER BY total::numeric DESC LIMIT 10`,
      merchantId, since
    );

    const totalRevenue = rows.reduce((s, r) => s + Number(r.total), 0);
    res.json({ success: true, data: { countries: rows.map(r => ({ country: r.country, flag: r.flag, revenue: Number(r.total), count: Number(r.cnt), share: totalRevenue > 0 ? Math.round((Number(r.total) / totalRevenue) * 100 * 10) / 10 : 0 })), total: totalRevenue } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch by country" });
    return;
  }
};

export const getByCustomer = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const merchantId = req.merchant!.id;
    const { days = "30", limit = "10" } = req.query as Record<string, string>;
    const since = new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000);

    const rows = await prisma.$queryRawUnsafe<Array<{ customer_name: string; customer_phone: string; total: string; cnt: bigint }>>(
      `SELECT "customerName" as customer_name, "customerPhone" as customer_phone, SUM(amount)::text as total, COUNT(*) as cnt
       FROM transactions WHERE "merchantId" = $1 AND status = 'SUCCESS' AND "createdAt" >= $2
       GROUP BY "customerName", "customerPhone" ORDER BY total::numeric DESC LIMIT $3`,
      merchantId, since, Number(limit)
    );

    res.json({ success: true, data: { customers: rows.map(r => ({ name: r.customer_name, phone: r.customer_phone, revenue: Number(r.total), orders: Number(r.cnt) })) } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch by customer" });
    return;
  }
};

export const getByChannel = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const merchantId = req.merchant!.id;
    const { days = "30" } = req.query as Record<string, string>;
    const since = new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000);

    const rows = await prisma.$queryRawUnsafe<Array<{ source: string; total: string; cnt: bigint }>>(
      `SELECT COALESCE(lp."utmSource", 'direct') as source, SUM(lp.amount)::text as total, COUNT(*) as cnt
       FROM link_payments lp JOIN payment_links pl ON pl.id = lp."linkId"
       WHERE pl."merchantId" = $1 AND lp."createdAt" >= $2
       GROUP BY COALESCE(lp."utmSource", 'direct') ORDER BY total::numeric DESC`,
      merchantId, since
    );

    res.json({ success: true, data: { channels: rows.map(r => ({ channel: r.source, revenue: Number(r.total), orders: Number(r.cnt) })) } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch by channel" });
    return;
  }
};

export const getTimeline = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const merchantId = req.merchant!.id;
    const { days = "30", granularity = "daily" } = req.query as Record<string, string>;
    const since = new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000);
    const truncMap: Record<string, string> = { hourly: "hour", daily: "day", weekly: "week", monthly: "month" };
    const trunc = truncMap[granularity] ?? "day";

    const rows = await prisma.$queryRawUnsafe<Array<{ period: Date; revenue: string; cnt: bigint }>>(
      `SELECT DATE_TRUNC('${trunc}', "createdAt") as period, SUM(amount)::text as revenue, COUNT(*) as cnt
       FROM transactions WHERE "merchantId" = $1 AND status = 'SUCCESS' AND "createdAt" >= $2
       GROUP BY DATE_TRUNC('${trunc}', "createdAt") ORDER BY period ASC`,
      merchantId, since
    );

    res.json({ success: true, data: { timeline: rows.map(r => ({ period: r.period.toISOString(), revenue: Number(r.revenue), count: Number(r.cnt) })), granularity } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch timeline" });
    return;
  }
};
