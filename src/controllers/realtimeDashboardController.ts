import { Response } from "express";
import { prisma } from "../config/database";
import { AuthenticatedRequest } from "../middleware/auth";

// ─── GET /api/realtime-dashboard/live ───────────────────────────────────────
export const getLiveMetrics = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const merchantId = req.merchant!.id;
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const fiveMinAgo  = new Date(now.getTime() - 5  * 60 * 1000);

    const [todayTx, lastHourTx, last5MinTx, pendingTx, todayRevenue, successCount, failedCount] =
      await Promise.all([
        prisma.transaction.count({ where: { merchantId, createdAt: { gte: startOfDay } } }),
        prisma.transaction.count({ where: { merchantId, createdAt: { gte: oneHourAgo } } }),
        prisma.transaction.count({ where: { merchantId, createdAt: { gte: fiveMinAgo } } }),
        prisma.transaction.count({ where: { merchantId, status: "PENDING" } }),
        prisma.transaction.aggregate({
          where: { merchantId, status: "SUCCESS", createdAt: { gte: startOfDay } },
          _sum: { amount: true },
        }),
        prisma.transaction.count({ where: { merchantId, status: "SUCCESS", createdAt: { gte: startOfDay } } }),
        prisma.transaction.count({ where: { merchantId, status: "FAILED",  createdAt: { gte: startOfDay } } }),
      ]);

    const totalToday   = successCount + failedCount;
    const successRate  = totalToday > 0 ? Math.round((successCount / totalToday) * 100 * 10) / 10 : 0;
    const tpmLastHour  = Math.round((lastHourTx / 60) * 10) / 10;
    const tpm5Min      = Math.round((last5MinTx / 5)  * 10) / 10;

    // Last 12 intervals (5-min buckets) for sparkline
    const sparkline: { time: string; count: number; revenue: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const bucketEnd   = new Date(now.getTime() - i * 5 * 60 * 1000);
      const bucketStart = new Date(bucketEnd.getTime() - 5 * 60 * 1000);
      const [cnt, rev]  = await Promise.all([
        prisma.transaction.count({
          where: { merchantId, createdAt: { gte: bucketStart, lt: bucketEnd } },
        }),
        prisma.transaction.aggregate({
          where: { merchantId, status: "SUCCESS", createdAt: { gte: bucketStart, lt: bucketEnd } },
          _sum: { amount: true },
        }),
      ]);
      sparkline.push({
        time:    bucketEnd.toISOString(),
        count:   cnt,
        revenue: Number(rev._sum.amount ?? 0),
      });
    }

    // Top countries last hour
    const topCountriesRaw = await prisma.$queryRawUnsafe
      { country: string; cnt: bigint; total: string }[]
    >(`
      SELECT country, COUNT(*) as cnt, SUM(amount)::text as total
      FROM transactions
      WHERE "merchantId" = $1 AND status = 'SUCCESS'
        AND "createdAt" >= $2
      GROUP BY country ORDER BY cnt DESC LIMIT 5
    `, merchantId, oneHourAgo);

    const topCountries = topCountriesRaw.map(r => ({
      country: r.country,
      count:   Number(r.cnt),
      revenue: Number(r.total ?? 0),
    }));

    // Active alerts
    const alerts: { type: string; message: string; severity: string }[] = [];
    if (successRate < 70)  alerts.push({ type: "SUCCESS_RATE",  message: `معدل النجاح منخفض: ${successRate}%`,      severity: "high"   });
    if (tpm5Min > 50)      alerts.push({ type: "HIGH_VOLUME",   message: `حجم مرتفع: ${tpm5Min} معاملة/دقيقة`,      severity: "medium" });
    if (pendingTx > 100)   alerts.push({ type: "PENDING_HIGH",  message: `${pendingTx} معاملة معلّقة`,               severity: "medium" });

    res.json({
      success: true,
      data: {
        overview: {
          todayTransactions: todayTx,
          todayRevenue:      Number(todayRevenue._sum.amount ?? 0),
          successRate,
          pendingCount:      pendingTx,
          tpmLastHour,
          tpm5Min,
          lastHourCount:     lastHourTx,
          last5MinCount:     last5MinTx,
        },
        sparkline,
        topCountries,
        alerts,
        generatedAt: now.toISOString(),
      },
    });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch live metrics" });
    return;
  }
};

// ─── GET /api/realtime-dashboard/drill-down ─────────────────────────────────
export const getDrillDown = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const merchantId = req.merchant!.id;
    const { dimension = "country", period = "today" } = req.query as Record<string, string>;

    const now       = new Date();
    const periodMap: Record<string, Date> = {
      today:   new Date(now.getFullYear(), now.getMonth(), now.getDate()),
      hour:    new Date(now.getTime() - 60 * 60 * 1000),
      "30min": new Date(now.getTime() - 30 * 60 * 1000),
    };
    const since = periodMap[period] ?? periodMap["today"];

    const allowedDimensions = ["country", "method", "currency", "status"];
    const dim = allowedDimensions.includes(dimension) ? dimension : "country";

    const columnMap: Record<string, string> = {
      country:  "country",
      method:   "method",
      currency: "currency",
      status:   "status",
    };
    const col = columnMap[dim];

    const rows = await prisma.$queryRawUnsafe
      { dim_val: string; cnt: bigint; total: string; success_cnt: bigint }[]
    >(`
      SELECT
        "${col}" as dim_val,
        COUNT(*) as cnt,
        SUM(amount)::text as total,
        COUNT(*) FILTER (WHERE status = 'SUCCESS') as success_cnt
      FROM transactions
      WHERE "merchantId" = $1 AND "createdAt" >= $2
      GROUP BY "${col}"
      ORDER BY cnt DESC
      LIMIT 10
    `, merchantId, since);

    const breakdown = rows.map(r => ({
      label:       r.dim_val,
      count:       Number(r.cnt),
      revenue:     Number(r.total ?? 0),
      successRate: Number(r.cnt) > 0
        ? Math.round((Number(r.success_cnt) / Number(r.cnt)) * 100 * 10) / 10
        : 0,
    }));

    res.json({ success: true, data: { dimension: dim, period, breakdown } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch drill-down" });
    return;
  }
};

// ─── POST /api/realtime-dashboard/record ────────────────────────────────────
export const recordMetric = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const merchantId = req.merchant!.id;
    const { metric, value, currency = "SAR", metadata } = req.body as {
      metric: string; value: number; currency?: string; metadata?: Record<string, unknown>;
    };

    if (!metric || value === undefined) {
      res.status(400).json({ success: false, error: "metric and value required" });
      return;
    }

    await prisma.$executeRawUnsafe(`
      INSERT INTO realtime_metrics (id, "merchantId", metric, value, currency, metadata)
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
      crypto.randomUUID(), merchantId, metric, value, currency,
      metadata ? JSON.stringify(metadata) : null,
    );

    res.json({ success: true, data: { recorded: true } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to record metric" });
    return;
  }
};

// ─── GET /api/realtime-dashboard/summary ────────────────────────────────────
export const getSummary = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const merchantId = req.merchant!.id;
    const now        = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday  = new Date(startOfDay.getTime() - 24 * 60 * 60 * 1000);

    const [todayAgg, yesterdayAgg, todayCount, yesterdayCount] = await Promise.all([
      prisma.transaction.aggregate({
        where: { merchantId, status: "SUCCESS", createdAt: { gte: startOfDay } },
        _sum: { amount: true }, _count: true,
      }),
      prisma.transaction.aggregate({
        where: { merchantId, status: "SUCCESS", createdAt: { gte: yesterday, lt: startOfDay } },
        _sum: { amount: true }, _count: true,
      }),
      prisma.transaction.count({ where: { merchantId, createdAt: { gte: startOfDay } } }),
      prisma.transaction.count({ where: { merchantId, createdAt: { gte: yesterday, lt: startOfDay } } }),
    ]);

    const todayRev     = Number(todayAgg._sum.amount    ?? 0);
    const yesterdayRev = Number(yesterdayAgg._sum.amount ?? 0);
    const revChange    = yesterdayRev > 0
      ? Math.round(((todayRev - yesterdayRev) / yesterdayRev) * 100 * 10) / 10
      : 0;
    const cntChange    = yesterdayCount > 0
      ? Math.round(((todayCount - yesterdayCount) / yesterdayCount) * 100 * 10) / 10
      : 0;

    res.json({
      success: true,
      data: {
        today:     { revenue: todayRev,     transactions: todayCount },
        yesterday: { revenue: yesterdayRev, transactions: yesterdayCount },
        changes:   { revenue: revChange,    transactions: cntChange },
      },
    });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch summary" });
    return;
  }
};
