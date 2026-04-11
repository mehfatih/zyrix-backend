import { Response } from "express";
import { prisma } from "../config/database";
import { AuthenticatedRequest } from "../types";

export const getCLVOverview = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const merchantId = req.merchant!.id;
    const [totalCustomers, activeCustomers, agg] = await Promise.all([
      prisma.customer.count({ where: { merchantId } }),
      prisma.customer.count({ where: { merchantId, totalOrders: { gte: 1 } } }),
      prisma.customer.aggregate({ where: { merchantId }, _avg: { totalSpent: true, avgOrderValue: true, totalOrders: true }, _sum: { totalSpent: true } }),
    ]);
    res.json({ success: true, data: { totalCustomers, activeCustomers, avgCLV: Math.round((agg._avg.totalSpent ?? 0) * 100) / 100, avgAOV: Math.round((agg._avg.avgOrderValue ?? 0) * 100) / 100, avgOrders: Math.round((agg._avg.totalOrders ?? 0) * 10) / 10, totalRevenue: Math.round((agg._sum.totalSpent ?? 0) * 100) / 100 } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch CLV overview" });
    return;
  }
};

export const getSegments = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const merchantId = req.merchant!.id;
    const [champions, loyal, atRisk, lost, newCustomers] = await Promise.all([
      prisma.customer.count({ where: { merchantId, totalOrders: { gte: 5 }, totalSpent: { gte: 1000 }, lastSeenAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } }),
      prisma.customer.count({ where: { merchantId, totalOrders: { gte: 3 }, totalSpent: { gte: 300 } } }),
      prisma.customer.count({ where: { merchantId, lastSeenAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), lt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) } } }),
      prisma.customer.count({ where: { merchantId, lastSeenAt: { lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } } }),
      prisma.customer.count({ where: { merchantId, firstSeenAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } }),
    ]);
    res.json({ success: true, data: { segments: [
      { segment: "champions", label: "العملاء المميزون", count: champions,    color: "#10B981", description: "شراء متكرر + قيمة عالية + نشطون" },
      { segment: "loyal",     label: "العملاء المخلصون", count: loyal,        color: "#3B82F6", description: "شراء منتظم بمستوى جيد" },
      { segment: "new",       label: "عملاء جدد",        count: newCustomers, color: "#8B5CF6", description: "انضموا خلال 30 يوماً" },
      { segment: "at_risk",   label: "في خطر",           count: atRisk,       color: "#F59E0B", description: "لم يشتروا منذ 60-90 يوماً" },
      { segment: "lost",      label: "خسرناهم",          count: lost,         color: "#EF4444", description: "أكثر من 90 يوماً بدون شراء" },
    ] } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch segments" });
    return;
  }
};

export const getCohorts = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const merchantId = req.merchant!.id;
    const { months = "6" } = req.query as Record<string, string>;
    const numMonths = Math.min(Number(months), 12);
    const cohorts: { cohort: string; newCustomers: number; avgCLV: number; avgOrders: number; retentionRate: number }[] = [];

    for (let i = numMonths - 1; i >= 0; i--) {
      const cohortStart = new Date();
      cohortStart.setMonth(cohortStart.getMonth() - i);
      cohortStart.setDate(1);
      cohortStart.setHours(0, 0, 0, 0);
      const cohortEnd = new Date(cohortStart);
      cohortEnd.setMonth(cohortEnd.getMonth() + 1);

      const [agg, retained] = await Promise.all([
        prisma.customer.aggregate({ where: { merchantId, firstSeenAt: { gte: cohortStart, lt: cohortEnd } }, _count: true, _avg: { totalSpent: true, totalOrders: true } }),
        prisma.customer.count({ where: { merchantId, firstSeenAt: { gte: cohortStart, lt: cohortEnd }, lastSeenAt: { gte: cohortEnd } } }),
      ]);

      const total = agg._count;
      cohorts.push({ cohort: `${cohortStart.getFullYear()}-${String(cohortStart.getMonth() + 1).padStart(2, "0")}`, newCustomers: total, avgCLV: Math.round((agg._avg.totalSpent ?? 0) * 100) / 100, avgOrders: Math.round((agg._avg.totalOrders ?? 0) * 10) / 10, retentionRate: total > 0 ? Math.round((retained / total) * 100 * 10) / 10 : 0 });
    }

    res.json({ success: true, data: { cohorts } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch cohorts" });
    return;
  }
};

export const getTopCustomers = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const merchantId = req.merchant!.id;
    const { limit = "20", sortBy = "totalSpent" } = req.query as Record<string, string>;
    const allowedSort = ["totalSpent", "totalOrders", "avgOrderValue"];
    const sort = allowedSort.includes(sortBy) ? sortBy : "totalSpent";

    const customers = await prisma.customer.findMany({ where: { merchantId }, orderBy: { [sort]: "desc" }, take: Math.min(Number(limit), 50), select: { customerId: true, name: true, phone: true, email: true, country: true, totalSpent: true, totalOrders: true, avgOrderValue: true, firstSeenAt: true, lastSeenAt: true, tags: true } });
    res.json({ success: true, data: { customers: customers.map(c => ({ ...c, segment: getSegment(c.totalOrders, c.totalSpent, c.lastSeenAt) })) } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch top customers" });
    return;
  }
};

export const predictCLV = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const merchantId = req.merchant!.id;
    const { customerId } = req.params;
    const customer = await prisma.customer.findFirst({ where: { merchantId, customerId } });
    if (!customer) { res.status(404).json({ success: false, error: "Customer not found" }); return; }

    const daysSinceFirst = Math.max(1, (Date.now() - customer.firstSeenAt.getTime()) / (1000 * 60 * 60 * 24));
    const ordersPerDay   = customer.totalOrders / daysSinceFirst;
    const predicted6m    = ordersPerDay * 180 * customer.avgOrderValue;
    const predicted12m   = ordersPerDay * 365 * customer.avgOrderValue;
    const daysSinceLast  = (Date.now() - customer.lastSeenAt.getTime()) / (1000 * 60 * 60 * 24);
    const churnRisk      = daysSinceLast > 90 ? "high" : daysSinceLast > 60 ? "medium" : "low";

    res.json({ success: true, data: { customerId, name: customer.name, currentCLV: customer.totalSpent, predicted6m: Math.round(predicted6m * 100) / 100, predicted12m: Math.round(predicted12m * 100) / 100, churnRisk, daysSinceLast: Math.round(daysSinceLast), ordersPerDay: Math.round(ordersPerDay * 1000) / 1000, segment: getSegment(customer.totalOrders, customer.totalSpent, customer.lastSeenAt) } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to predict CLV" });
    return;
  }
};

function getSegment(orders: number, spent: number, lastSeen: Date): string {
  const d = (Date.now() - lastSeen.getTime()) / (1000 * 60 * 60 * 24);
  if (orders >= 5 && spent >= 1000 && d <= 30) return "champion";
  if (orders >= 3 && spent >= 300)             return "loyal";
  if (d > 90)                                  return "lost";
  if (d > 60)                                  return "at_risk";
  return "new";
}
