import { Response } from "express";
import { prisma } from "../config/database";
import { AuthenticatedRequest } from "../middleware/auth";

// ─── POST /api/conversion-funnel/event ──────────────────────────────────────
export const trackEvent = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const merchantId = req.merchant!.id;
    const { sessionId, stage, channel, country, device, currency, amount } = req.body as {
      sessionId: string; stage: string; channel?: string; country?: string;
      device?: string; currency?: string; amount?: number;
    };

    if (!sessionId || !stage) {
      res.status(400).json({ success: false, error: "sessionId and stage required" });
      return;
    }

    const validStages = ["view", "checkout", "payment", "success"];
    if (!validStages.includes(stage)) {
      res.status(400).json({ success: false, error: `stage must be one of: ${validStages.join(", ")}` });
      return;
    }

    await prisma.$executeRawUnsafe(`
      INSERT INTO funnel_events (id, "merchantId", "sessionId", stage, channel, country, device, currency, amount)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `,
      crypto.randomUUID(), merchantId, sessionId, stage,
      channel ?? null, country ?? null, device ?? null,
      currency ?? null, amount ?? null,
    );

    res.json({ success: true, data: { tracked: true } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to track funnel event" });
    return;
  }
};

// ─── GET /api/conversion-funnel/overview ────────────────────────────────────
export const getFunnelOverview = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const merchantId = req.merchant!.id;
    const { days = "30" } = req.query as Record<string, string>;
    const since = new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000);

    // Count unique sessions per stage
    const stageRows = await prisma.$queryRawUnsafe
      { stage: string; sessions: bigint; total_amount: string }[]
    >(`
      SELECT
        stage,
        COUNT(DISTINCT "sessionId") as sessions,
        COALESCE(SUM(amount), 0)::text as total_amount
      FROM funnel_events
      WHERE "merchantId" = $1 AND "completedAt" >= $2
      GROUP BY stage
      ORDER BY
        CASE stage
          WHEN 'view'     THEN 1
          WHEN 'checkout' THEN 2
          WHEN 'payment'  THEN 3
          WHEN 'success'  THEN 4
          ELSE 5
        END
    `, merchantId, since);

    const stages = ["view", "checkout", "payment", "success"];
    const stageMap: Record<string, { sessions: number; revenue: number }> = {};
    for (const r of stageRows) {
      stageMap[r.stage] = { sessions: Number(r.sessions), revenue: Number(r.total_amount) };
    }

    const funnel = stages.map((stage, i) => {
      const current  = stageMap[stage]?.sessions ?? 0;
      const previous = i > 0 ? (stageMap[stages[i - 1]]?.sessions ?? 0) : current;
      const dropRate = previous > 0 ? Math.round(((previous - current) / previous) * 100 * 10) / 10 : 0;
      const convRate = i === 0
        ? 100
        : (stageMap["view"]?.sessions ?? 0) > 0
          ? Math.round((current / (stageMap["view"]?.sessions ?? 1)) * 100 * 10) / 10
          : 0;
      return {
        stage,
        sessions:           current,
        revenue:            stageMap[stage]?.revenue ?? 0,
        dropRateFromPrev:   dropRate,
        overallConversion:  convRate,
      };
    });

    const totalViews    = stageMap["view"]?.sessions ?? 0;
    const totalSuccess  = stageMap["success"]?.sessions ?? 0;
    const overallConv   = totalViews > 0
      ? Math.round((totalSuccess / totalViews) * 100 * 100) / 100
      : 0;

    res.json({
      success: true,
      data: { funnel, overallConversionRate: overallConv, period: { days: Number(days), since: since.toISOString() } },
    });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch funnel overview" });
    return;
  }
};

// ─── GET /api/conversion-funnel/by-channel ──────────────────────────────────
export const getFunnelByChannel = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const merchantId = req.merchant!.id;
    const { days = "30" } = req.query as Record<string, string>;
    const since = new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000);

    const rows = await prisma.$queryRawUnsafe
      { channel: string; stage: string; sessions: bigint }[]
    >(`
      SELECT channel, stage, COUNT(DISTINCT "sessionId") as sessions
      FROM funnel_events
      WHERE "merchantId" = $1 AND "completedAt" >= $2 AND channel IS NOT NULL
      GROUP BY channel, stage
      ORDER BY channel, stage
    `, merchantId, since);

    const channelMap: Record<string, Record<string, number>> = {};
    for (const r of rows) {
      const ch = r.channel ?? "direct";
      if (!channelMap[ch]) channelMap[ch] = {};
      channelMap[ch][r.stage] = Number(r.sessions);
    }

    const result = Object.entries(channelMap).map(([channel, stages]) => {
      const views   = stages["view"]    ?? 0;
      const success = stages["success"] ?? 0;
      const conv    = views > 0 ? Math.round((success / views) * 100 * 10) / 10 : 0;
      return { channel, stages, conversionRate: conv };
    }).sort((a, b) => b.conversionRate - a.conversionRate);

    res.json({ success: true, data: { channels: result } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch funnel by channel" });
    return;
  }
};

// ─── GET /api/conversion-funnel/by-country ──────────────────────────────────
export const getFunnelByCountry = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const merchantId = req.merchant!.id;
    const { days = "30" } = req.query as Record<string, string>;
    const since = new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000);

    const rows = await prisma.$queryRawUnsafe
      { country: string; stage: string; sessions: bigint }[]
    >(`
      SELECT country, stage, COUNT(DISTINCT "sessionId") as sessions
      FROM funnel_events
      WHERE "merchantId" = $1 AND "completedAt" >= $2 AND country IS NOT NULL
      GROUP BY country, stage
      ORDER BY country, stage
    `, merchantId, since);

    const countryMap: Record<string, Record<string, number>> = {};
    for (const r of rows) {
      const co = r.country;
      if (!countryMap[co]) countryMap[co] = {};
      countryMap[co][r.stage] = Number(r.sessions);
    }

    const result = Object.entries(countryMap).map(([country, stages]) => {
      const views   = stages["view"]    ?? 0;
      const success = stages["success"] ?? 0;
      const conv    = views > 0 ? Math.round((success / views) * 100 * 10) / 10 : 0;
      return { country, stages, conversionRate: conv };
    }).sort((a, b) => b.conversionRate - a.conversionRate);

    res.json({ success: true, data: { countries: result } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch funnel by country" });
    return;
  }
};

// ─── GET /api/conversion-funnel/by-device ───────────────────────────────────
export const getFunnelByDevice = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const merchantId = req.merchant!.id;
    const { days = "30" } = req.query as Record<string, string>;
    const since = new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000);

    const rows = await prisma.$queryRawUnsafe
      { device: string; stage: string; sessions: bigint }[]
    >(`
      SELECT device, stage, COUNT(DISTINCT "sessionId") as sessions
      FROM funnel_events
      WHERE "merchantId" = $1 AND "completedAt" >= $2 AND device IS NOT NULL
      GROUP BY device, stage
    `, merchantId, since);

    const deviceMap: Record<string, Record<string, number>> = {};
    for (const r of rows) {
      const dv = r.device;
      if (!deviceMap[dv]) deviceMap[dv] = {};
      deviceMap[dv][r.stage] = Number(r.sessions);
    }

    const result = Object.entries(deviceMap).map(([device, stages]) => {
      const views   = stages["view"]    ?? 0;
      const success = stages["success"] ?? 0;
      const conv    = views > 0 ? Math.round((success / views) * 100 * 10) / 10 : 0;
      return { device, stages, conversionRate: conv };
    }).sort((a, b) => b.conversionRate - a.conversionRate);

    res.json({ success: true, data: { devices: result } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch funnel by device" });
    return;
  }
};

// ─── GET /api/conversion-funnel/drop-analysis ───────────────────────────────
export const getDropAnalysis = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const merchantId = req.merchant!.id;
    const { days = "30" } = req.query as Record<string, string>;
    const since = new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000);

    // Sessions that reached checkout but NOT payment
    const [droppedAtCheckout, droppedAtPayment, completedAll] = await Promise.all([
      prisma.$queryRawUnsafe<{ cnt: bigint }[]>(`
        SELECT COUNT(DISTINCT "sessionId") as cnt FROM funnel_events
        WHERE "merchantId" = $1 AND "completedAt" >= $2
          AND stage = 'checkout'
          AND "sessionId" NOT IN (
            SELECT DISTINCT "sessionId" FROM funnel_events
            WHERE "merchantId" = $1 AND stage = 'payment'
          )
      `, merchantId, since),
      prisma.$queryRawUnsafe<{ cnt: bigint }[]>(`
        SELECT COUNT(DISTINCT "sessionId") as cnt FROM funnel_events
        WHERE "merchantId" = $1 AND "completedAt" >= $2
          AND stage = 'payment'
          AND "sessionId" NOT IN (
            SELECT DISTINCT "sessionId" FROM funnel_events
            WHERE "merchantId" = $1 AND stage = 'success'
          )
      `, merchantId, since),
      prisma.$queryRawUnsafe<{ cnt: bigint }[]>(`
        SELECT COUNT(DISTINCT "sessionId") as cnt FROM funnel_events
        WHERE "merchantId" = $1 AND "completedAt" >= $2 AND stage = 'success'
      `, merchantId, since),
    ]);

    res.json({
      success: true,
      data: {
        droppedAtCheckout: Number(droppedAtCheckout[0]?.cnt ?? 0),
        droppedAtPayment:  Number(droppedAtPayment[0]?.cnt ?? 0),
        completed:         Number(completedAll[0]?.cnt ?? 0),
        recommendations: [
          Number(droppedAtCheckout[0]?.cnt ?? 0) > 50
            ? "⚠️ نسبة تسريب عالية عند Checkout — ابسّط النموذج أو أضف Trust signals"
            : null,
          Number(droppedAtPayment[0]?.cnt ?? 0) > 30
            ? "⚠️ نسبة فشل عالية عند الدفع — راجع بوابات الدفع أو أضف طرق دفع محلية"
            : null,
        ].filter(Boolean),
      },
    });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch drop analysis" });
    return;
  }
};
