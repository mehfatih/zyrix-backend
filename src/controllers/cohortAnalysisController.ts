import { Request, Response } from "express";
import { prisma } from "../config/database";
import { AuthenticatedRequest } from "../types";

export const getCohortRetention = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { months = "6" } = req.query as Record<string, string>;
    const numMonths = Math.min(Number(months), 12);

    const cohorts: {
      cohort: string; newCustomers: number;
      retention: { month: number; count: number; rate: number }[];
    }[] = [];

    for (let i = numMonths - 1; i >= 0; i--) {
      const cohortStart = new Date();
      cohortStart.setMonth(cohortStart.getMonth() - i);
      cohortStart.setDate(1); cohortStart.setHours(0, 0, 0, 0);
      const cohortEnd = new Date(cohortStart);
      cohortEnd.setMonth(cohortEnd.getMonth() + 1);

      const newCustomers = await prisma.customer.count({
        where: { merchantId, firstSeenAt: { gte: cohortStart, lt: cohortEnd } },
      });

      const retention: { month: number; count: number; rate: number }[] = [];
      const monthsToTrack = Math.min(i + 1, 6);

      for (let m = 0; m < monthsToTrack; m++) {
        const windowStart = new Date(cohortStart);
        windowStart.setMonth(windowStart.getMonth() + m);
        const windowEnd = new Date(windowStart);
        windowEnd.setMonth(windowEnd.getMonth() + 1);

        const retained = await prisma.customer.count({
          where: {
            merchantId,
            firstSeenAt: { gte: cohortStart, lt: cohortEnd },
            lastSeenAt:  { gte: windowStart, lt: windowEnd },
          },
        });

        retention.push({
          month: m,
          count: retained,
          rate:  newCustomers > 0 ? Math.round((retained / newCustomers) * 100 * 10) / 10 : 0,
        });
      }

      cohorts.push({
        cohort: `${cohortStart.getFullYear()}-${String(cohortStart.getMonth() + 1).padStart(2, "0")}`,
        newCustomers,
        retention,
      });
    }

    res.json({ success: true, data: { cohorts } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch cohort retention" });
    return;
  }
};

export const getCohortRevenue = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { months = "6" } = req.query as Record<string, string>;
    const numMonths = Math.min(Number(months), 12);

    const cohorts: {
      cohort: string; newCustomers: number; totalRevenue: number; avgRevenue: number; avgOrders: number;
    }[] = [];

    for (let i = numMonths - 1; i >= 0; i--) {
      const cohortStart = new Date();
      cohortStart.setMonth(cohortStart.getMonth() - i);
      cohortStart.setDate(1); cohortStart.setHours(0, 0, 0, 0);
      const cohortEnd = new Date(cohortStart);
      cohortEnd.setMonth(cohortEnd.getMonth() + 1);

      const agg = await prisma.customer.aggregate({
        where: { merchantId, firstSeenAt: { gte: cohortStart, lt: cohortEnd } },
        _count: true,
        _avg:  { totalSpent: true, totalOrders: true },
        _sum:  { totalSpent: true },
      });

      cohorts.push({
        cohort:       `${cohortStart.getFullYear()}-${String(cohortStart.getMonth() + 1).padStart(2, "0")}`,
        newCustomers: agg._count,
        totalRevenue: Math.round((agg._sum.totalSpent  ?? 0) * 100) / 100,
        avgRevenue:   Math.round((agg._avg.totalSpent  ?? 0) * 100) / 100,
        avgOrders:    Math.round((agg._avg.totalOrders ?? 0) * 10)  / 10,
      });
    }

    res.json({ success: true, data: { cohorts } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch cohort revenue" });
    return;
  }
};

export const getCohortChurn = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;

    const [total, active30, active60, churned90] = await Promise.all([
      prisma.customer.count({ where: { merchantId } }),
      prisma.customer.count({ where: { merchantId, lastSeenAt: { gte: new Date(Date.now() - 30 * 864e5) } } }),
      prisma.customer.count({ where: { merchantId, lastSeenAt: { gte: new Date(Date.now() - 60 * 864e5) } } }),
      prisma.customer.count({ where: { merchantId, lastSeenAt: { lt:  new Date(Date.now() - 90 * 864e5) } } }),
    ]);

    res.json({
      success: true,
      data: {
        total,
        active30,  active30Rate:  total > 0 ? Math.round((active30  / total) * 100 * 10) / 10 : 0,
        active60,  active60Rate:  total > 0 ? Math.round((active60  / total) * 100 * 10) / 10 : 0,
        churned90, churnRate:     total > 0 ? Math.round((churned90 / total) * 100 * 10) / 10 : 0,
      },
    });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch churn data" });
    return;
  }
};
