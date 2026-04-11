import { Request, Response } from "express";
import { prisma } from "../config/database";
import { AuthenticatedRequest } from "../types";

export const listTests = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const tests = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM ab_tests WHERE "merchantId" = $1 ORDER BY "createdAt" DESC`, merchantId
    );
    for (const test of tests) {
      const variants = await prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM ab_variants WHERE "testId" = $1`, test.id
      );
      test.variants = variants;
    }
    res.json({ success: true, data: { tests } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to list tests" });
    return;
  }
};

export const createTest = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { name, description, type = "checkout", trafficSplit = 50, variants = [], startDate, endDate } = req.body as {
      name: string; description?: string; type?: string; trafficSplit?: number;
      variants: { name: string; description?: string; config?: any; isControl?: boolean }[];
      startDate?: string; endDate?: string;
    };
    if (!name) { res.status(400).json({ success: false, error: "name required" }); return; }

    const testId = crypto.randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO ab_tests (id, "merchantId", name, description, type, "trafficSplit", "startDate", "endDate") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      testId, merchantId, name, description ?? null, type, trafficSplit,
      startDate ? new Date(startDate) : null, endDate ? new Date(endDate) : null
    );

    const createdVariants = [];
    for (const v of variants) {
      const vid = crypto.randomUUID();
      await prisma.$executeRawUnsafe(
        `INSERT INTO ab_variants (id, "testId", name, description, config, "isControl") VALUES ($1,$2,$3,$4,$5,$6)`,
        vid, testId, v.name, v.description ?? null, v.config ? JSON.stringify(v.config) : null, v.isControl ?? false
      );
      createdVariants.push({ id: vid, ...v });
    }

    res.json({ success: true, data: { test: { id: testId, name, type, trafficSplit, status: "draft", variants: createdVariants } } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to create test" });
    return;
  }
};

export const getTest = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { id } = req.params;
    const tests = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM ab_tests WHERE id = $1 AND "merchantId" = $2`, id, merchantId
    );
    if (!tests.length) { res.status(404).json({ success: false, error: "Test not found" }); return; }
    const test = tests[0];
    test.variants = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM ab_variants WHERE "testId" = $1`, id);
    res.json({ success: true, data: { test } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to get test" });
    return;
  }
};

export const updateTestStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { id } = req.params;
    const { status, winnerVariant } = req.body as { status: string; winnerVariant?: string };
    const validStatuses = ["draft", "running", "paused", "completed"];
    if (!validStatuses.includes(status)) { res.status(400).json({ success: false, error: "Invalid status" }); return; }
    await prisma.$executeRawUnsafe(
      `UPDATE ab_tests SET status = $1, "winnerVariant" = COALESCE($2, "winnerVariant"), "updatedAt" = NOW() WHERE id = $3 AND "merchantId" = $4`,
      status, winnerVariant ?? null, id, merchantId
    );
    res.json({ success: true, data: { updated: true } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to update test" });
    return;
  }
};

export const deleteTest = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { id } = req.params;
    await prisma.$executeRawUnsafe(`DELETE FROM ab_events   WHERE "testId" = $1`, id);
    await prisma.$executeRawUnsafe(`DELETE FROM ab_variants WHERE "testId" = $1`, id);
    await prisma.$executeRawUnsafe(`DELETE FROM ab_tests    WHERE id = $1 AND "merchantId" = $2`, id, merchantId);
    res.json({ success: true, data: { deleted: true } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to delete test" });
    return;
  }
};

export const trackEvent = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { testId, variantId, sessionId, event, value } = req.body as {
      testId: string; variantId: string; sessionId?: string; event: string; value?: number;
    };
    if (!testId || !variantId || !event) { res.status(400).json({ success: false, error: "testId, variantId, event required" }); return; }
    await prisma.$executeRawUnsafe(
      `INSERT INTO ab_events (id, "testId", "variantId", "merchantId", "sessionId", event, value) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      crypto.randomUUID(), testId, variantId, merchantId, sessionId ?? null, event, value ?? null
    );
    res.json({ success: true, data: { tracked: true } });
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

    const tests = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM ab_tests WHERE id = $1 AND "merchantId" = $2`, id, merchantId
    );
    if (!tests.length) { res.status(404).json({ success: false, error: "Test not found" }); return; }

    const variants = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM ab_variants WHERE "testId" = $1`, id);

    const results = [];
    for (const v of variants) {
      const stats = await prisma.$queryRawUnsafe<Array<{ event: string; cnt: bigint; total_value: string }>>(
        `SELECT event, COUNT(*) as cnt, COALESCE(SUM(value), 0)::text as total_value
         FROM ab_events WHERE "testId" = $1 AND "variantId" = $2
         GROUP BY event`,
        id, v.id
      );
      const views    = Number(stats.find(s => s.event === "view")?.cnt    ?? 0);
      const converts = Number(stats.find(s => s.event === "convert")?.cnt ?? 0);
      const revenue  = Number(stats.find(s => s.event === "convert")?.total_value ?? 0);
      results.push({
        variantId:       v.id,
        variantName:     v.name,
        isControl:       v.isControl,
        views,
        conversions:     converts,
        conversionRate:  views > 0 ? Math.round((converts / views) * 100 * 100) / 100 : 0,
        revenue:         Math.round(revenue * 100) / 100,
        revenuePerView:  views > 0 ? Math.round((revenue / views) * 100) / 100 : 0,
      });
    }

    // Determine winner
    const winner = results.reduce((best, curr) => curr.conversionRate > (best?.conversionRate ?? 0) ? curr : best, results[0]);

    res.json({ success: true, data: { testId: id, testName: tests[0].name, status: tests[0].status, results, winner: winner?.variantId ?? null, winnerName: winner?.variantName ?? null } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to get results" });
    return;
  }
};
