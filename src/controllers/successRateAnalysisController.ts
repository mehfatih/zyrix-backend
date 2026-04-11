import { Response } from "express";
import { prisma } from "../config/database";
import { AuthenticatedRequest } from "../types";

export const getOverview = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const merchantId = req.merchant!.id;
    const { days = "30" } = req.query as Record<string, string>;
    const since = new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000);

    const [total, success, failed, pending] = await Promise.all([
      prisma.transaction.count({ where: { merchantId, createdAt: { gte: since } } }),
      prisma.transaction.count({ where: { merchantId, status: "SUCCESS", createdAt: { gte: since } } }),
      prisma.transaction.count({ where: { merchantId, status: "FAILED",  createdAt: { gte: since } } }),
      prisma.transaction.count({ where: { merchantId, status: "PENDING", createdAt: { gte: since } } }),
    ]);

    const rate = total > 0 ? Math.round((success / total) * 100 * 100) / 100 : 0;

    const trend: { date: string; rate: number; total: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      const [t, s] = await Promise.all([
        prisma.transaction.count({ where: { merchantId, createdAt: { gte: dayStart, lt: dayEnd } } }),
        prisma.transaction.count({ where: { merchantId, status: "SUCCESS", createdAt: { gte: dayStart, lt: dayEnd } } }),
      ]);
      trend.push({ date: dayStart.toISOString().split("T")[0], rate: t > 0 ? Math.round((s / t) * 100 * 100) / 100 : 0, total: t });
    }

    res.json({ success: true, data: { overall: { total, success, failed, pending, rate }, trend } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch success rate overview" });
    return;
  }
};

export const getByBank = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const merchantId = req.merchant!.id;
    const { days = "30" } = req.query as Record<string, string>;
    const since = new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000);

    const banks = await prisma.$queryRawUnsafe<Array<{ bank_name: string; total: bigint; success_cnt: bigint; failed_cnt: bigint }>>(
      `SELECT COALESCE(bl."bankName", 'Unknown') as bank_name,
              COUNT(t.id) as total,
              COUNT(t.id) FILTER (WHERE t.status = 'SUCCESS') as success_cnt,
              COUNT(t.id) FILTER (WHERE t.status = 'FAILED')  as failed_cnt
       FROM transactions t
       LEFT JOIN bin_lookups bl ON bl."merchantId" = t."merchantId"
       WHERE t."merchantId" = $1 AND t."createdAt" >= $2
       GROUP BY COALESCE(bl."bankName", 'Unknown') ORDER BY total DESC LIMIT 15`,
      merchantId, since
    );

    res.json({ success: true, data: { banks: banks.map(r => ({ bank: r.bank_name, total: Number(r.total), success: Number(r.success_cnt), failed: Number(r.failed_cnt), successRate: Number(r.total) > 0 ? Math.round((Number(r.success_cnt) / Number(r.total)) * 100 * 10) / 10 : 0 })) } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch by bank" });
    return;
  }
};

export const getByCountry = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const merchantId = req.merchant!.id;
    const { days = "30" } = req.query as Record<string, string>;
    const since = new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000);

    const rows = await prisma.$queryRawUnsafe<Array<{ country: string; total: bigint; success_cnt: bigint }>>(
      `SELECT country, COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'SUCCESS') as success_cnt
       FROM transactions WHERE "merchantId" = $1 AND "createdAt" >= $2
       GROUP BY country ORDER BY total DESC LIMIT 15`,
      merchantId, since
    );

    res.json({ success: true, data: { countries: rows.map(r => ({ country: r.country, total: Number(r.total), success: Number(r.success_cnt), successRate: Number(r.total) > 0 ? Math.round((Number(r.success_cnt) / Number(r.total)) * 100 * 10) / 10 : 0 })) } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch by country" });
    return;
  }
};

export const getByMethod = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const merchantId = req.merchant!.id;
    const { days = "30" } = req.query as Record<string, string>;
    const since = new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000);

    const rows = await prisma.$queryRawUnsafe<Array<{ method: string; total: bigint; success_cnt: bigint; avg_amount: string }>>(
      `SELECT method, COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'SUCCESS') as success_cnt, AVG(amount)::text as avg_amount
       FROM transactions WHERE "merchantId" = $1 AND "createdAt" >= $2
       GROUP BY method ORDER BY total DESC`,
      merchantId, since
    );

    res.json({ success: true, data: { methods: rows.map(r => ({ method: r.method, total: Number(r.total), success: Number(r.success_cnt), avgAmount: Number(r.avg_amount ?? 0), successRate: Number(r.total) > 0 ? Math.round((Number(r.success_cnt) / Number(r.total)) * 100 * 10) / 10 : 0 })) } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch by method" });
    return;
  }
};

export const getFailureReasons = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const merchantId = req.merchant!.id;
    const { days = "30" } = req.query as Record<string, string>;
    const since = new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000);

    const rows = await prisma.$queryRawUnsafe<Array<{ error_code: string; cnt: bigint }>>(
      `SELECT COALESCE(rl."errorCode", 'UNKNOWN') as error_code, COUNT(*) as cnt
       FROM retry_logs rl JOIN transactions t ON t.id = rl."transactionId"
       WHERE t."merchantId" = $1 AND rl."executedAt" >= $2 AND rl.status = 'FAILED'
       GROUP BY COALESCE(rl."errorCode", 'UNKNOWN') ORDER BY cnt DESC LIMIT 10`,
      merchantId, since
    );

    const labels: Record<string, string> = { INSUFFICIENT_FUNDS: "رصيد غير كافٍ", CARD_DECLINED: "بطاقة مرفوضة", EXPIRED_CARD: "بطاقة منتهية", INVALID_CVV: "CVV غير صحيح", TIMEOUT: "انتهت المهلة", GATEWAY_ERROR: "خطأ في البوابة", FRAUD_DETECTED: "احتيال محتمل", UNKNOWN: "سبب غير معروف" };
    res.json({ success: true, data: { reasons: rows.map(r => ({ code: r.error_code, count: Number(r.cnt), label: labels[r.error_code] ?? r.error_code })) } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch failure reasons" });
    return;
  }
};
