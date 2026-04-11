import { Request, Response } from "express";
import { prisma } from "../config/database";
import { AuthenticatedRequest } from "../types";

export const getRevenueForecast = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { months = "3" } = req.query as Record<string, string>;
    const numMonths = Math.min(Number(months), 6);

    // Get last 6 months actual revenue
    const historical: { month: string; revenue: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const start = new Date();
      start.setMonth(start.getMonth() - i);
      start.setDate(1); start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setMonth(end.getMonth() + 1);
      const agg = await prisma.transaction.aggregate({
        where: { merchantId, status: "SUCCESS", createdAt: { gte: start, lt: end } },
        _sum: { amount: true },
      });
      historical.push({
        month:   `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`,
        revenue: Number(agg._sum.amount ?? 0),
      });
    }

    // Simple linear regression
    const n   = historical.length;
    const x   = historical.map((_, i) => i);
    const y   = historical.map(h => h.revenue);
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((s, xi, i) => s + xi * y[i], 0);
    const sumX2 = x.reduce((s, xi) => s + xi * xi, 0);
    const slope     = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX) || 0;
    const intercept = (sumY - slope * sumX) / n;

    const forecast: { month: string; predicted: number; low: number; high: number }[] = [];
    for (let i = 0; i < numMonths; i++) {
      const futureX   = n + i;
      const predicted = Math.max(0, Math.round((slope * futureX + intercept) * 100) / 100);
      const variance  = predicted * 0.15;
      const d = new Date();
      d.setMonth(d.getMonth() + i + 1);
      forecast.push({
        month:     `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        predicted,
        low:       Math.round(Math.max(0, predicted - variance) * 100) / 100,
        high:      Math.round((predicted + variance) * 100) / 100,
      });
    }

    const totalForecast = forecast.reduce((s, f) => s + f.predicted, 0);
    const avgHistorical = sumY / n;
    const growthRate    = avgHistorical > 0 ? Math.round(((forecast[0]?.predicted ?? 0) - avgHistorical) / avgHistorical * 100 * 10) / 10 : 0;

    res.json({ success: true, data: { historical, forecast, summary: { totalForecast: Math.round(totalForecast * 100) / 100, avgHistorical: Math.round(avgHistorical * 100) / 100, growthRate, trend: slope > 0 ? "upward" : slope < 0 ? "downward" : "flat" } } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to generate forecast" });
    return;
  }
};

export const getCustomerForecast = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;

    const historical: { month: string; newCustomers: number; totalCustomers: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const start = new Date();
      start.setMonth(start.getMonth() - i);
      start.setDate(1); start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setMonth(end.getMonth() + 1);
      const [newC, totalC] = await Promise.all([
        prisma.customer.count({ where: { merchantId, firstSeenAt: { gte: start, lt: end } } }),
        prisma.customer.count({ where: { merchantId, createdAt: { lt: end } } }),
      ]);
      historical.push({
        month: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`,
        newCustomers: newC, totalCustomers: totalC,
      });
    }

    const newCounts = historical.map(h => h.newCustomers);
    const avgNew    = newCounts.reduce((a, b) => a + b, 0) / newCounts.length;
    const lastTotal = historical[historical.length - 1]?.totalCustomers ?? 0;

    const forecast: { month: string; predictedNew: number; predictedTotal: number }[] = [];
    let runningTotal = lastTotal;
    for (let i = 0; i < 3; i++) {
      const d = new Date();
      d.setMonth(d.getMonth() + i + 1);
      const predictedNew = Math.round(avgNew * (1 + 0.05 * i));
      runningTotal += predictedNew;
      forecast.push({
        month:          `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        predictedNew,
        predictedTotal: runningTotal,
      });
    }

    res.json({ success: true, data: { historical, forecast } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to forecast customers" });
    return;
  }
};

export const getTransactionForecast = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;

    const historical: { date: string; count: number; successRate: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const start = new Date(Date.now() - i * 864e5);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start.getTime() + 864e5);
      const [total, success] = await Promise.all([
        prisma.transaction.count({ where: { merchantId, createdAt: { gte: start, lt: end } } }),
        prisma.transaction.count({ where: { merchantId, status: "SUCCESS", createdAt: { gte: start, lt: end } } }),
      ]);
      historical.push({
        date:        start.toISOString().split("T")[0],
        count:       total,
        successRate: total > 0 ? Math.round((success / total) * 100 * 10) / 10 : 0,
      });
    }

    const avg7 = historical.slice(-7).reduce((s, h) => s + h.count, 0) / 7;
    const avgRate = historical.slice(-7).reduce((s, h) => s + h.successRate, 0) / 7;

    const forecast: { date: string; predicted: number; predictedSuccessRate: number }[] = [];
    for (let i = 1; i <= 7; i++) {
      const d = new Date(Date.now() + i * 864e5);
      forecast.push({
        date:                  d.toISOString().split("T")[0],
        predicted:             Math.round(avg7),
        predictedSuccessRate:  Math.round(avgRate * 10) / 10,
      });
    }

    res.json({ success: true, data: { historical, forecast, avgDaily: Math.round(avg7), avgSuccessRate: Math.round(avgRate * 10) / 10 } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to forecast transactions" });
    return;
  }
};

export const getScenarios = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;

    const last30 = await prisma.transaction.aggregate({
      where: { merchantId, status: "SUCCESS", createdAt: { gte: new Date(Date.now() - 30 * 864e5) } },
      _sum: { amount: true }, _count: true,
    });

    const base     = Number(last30._sum.amount ?? 0);
    const baseCnt  = last30._count;
    const avgOrder = baseCnt > 0 ? base / baseCnt : 0;

    const scenarios = [
      { name: "متفائل 🚀",   description: "زيادة 30% في الحجم + تحسين معدل النجاح 5%", revenue: Math.round(base * 1.30 * 100) / 100, transactions: Math.round(baseCnt * 1.30), probability: 25 },
      { name: "معتدل ✅",    description: "نمو طبيعي 10% مع ثبات الأداء",               revenue: Math.round(base * 1.10 * 100) / 100, transactions: Math.round(baseCnt * 1.10), probability: 50 },
      { name: "محافظ ⚠️",    description: "نمو 0% مع احتمال انخفاض طفيف",              revenue: Math.round(base * 0.95 * 100) / 100, transactions: Math.round(baseCnt * 0.95), probability: 25 },
    ];

    res.json({ success: true, data: { baseRevenue: base, baseTransactions: baseCnt, avgOrderValue: Math.round(avgOrder * 100) / 100, scenarios } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to generate scenarios" });
    return;
  }
};
