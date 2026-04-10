// src/controllers/customersController.ts
import { Response, NextFunction } from "express";
import { prisma } from "../config/database";
import { AuthenticatedRequest } from "../types";

function calcRFM(customer: { lastSeenAt: Date; totalOrders: number; totalSpent: number }) {
  const daysSinceLast = Math.floor((Date.now() - new Date(customer.lastSeenAt).getTime()) / 86400000);
  const R = daysSinceLast <= 7 ? 5 : daysSinceLast <= 14 ? 4 : daysSinceLast <= 30 ? 3 : daysSinceLast <= 60 ? 2 : 1;
  const F = customer.totalOrders >= 10 ? 5 : customer.totalOrders >= 6 ? 4 : customer.totalOrders >= 3 ? 3 : customer.totalOrders >= 2 ? 2 : 1;
  const M = customer.totalSpent >= 5000 ? 5 : customer.totalSpent >= 2000 ? 4 : customer.totalSpent >= 500 ? 3 : customer.totalSpent >= 100 ? 2 : 1;
  const score = Math.round((R + F + M) / 3 * 10) / 10;
  let segment: string;
  if (R >= 4 && F >= 4 && M >= 4)   segment = "VIP";
  else if (R >= 3 && F >= 3)         segment = "loyal";
  else if (R >= 4 && F <= 2)         segment = "new";
  else if (R <= 2 && F >= 3)         segment = "at_risk";
  else if (R <= 2 && F <= 2)         segment = "lost";
  else                               segment = "active";
  return { R, F, M, score, segment, daysSinceLast };
}

function buildRecommendations(rfm: ReturnType<typeof calcRFM>, c: { totalOrders: number; refundCount: number }) {
  const recs: Array<{ type: string; priority: "high" | "medium" | "low"; titleAr: string; descAr: string; action: string }> = [];
  if (rfm.segment === "at_risk") recs.push({ type: "retention", priority: "high",   titleAr: "عميل في خطر فقدان",     descAr: `لم يشترِ منذ ${rfm.daysSinceLast} يوماً — أرسل عرضاً خاصاً`, action: "send_offer" });
  if (rfm.segment === "VIP")     recs.push({ type: "upsell",    priority: "high",   titleAr: "عميل VIP — فرصة upsell", descAr: "ينفق بانتظام — عرّفه على خدماتك المتميزة", action: "upsell" });
  if (rfm.segment === "lost")    recs.push({ type: "winback",   priority: "medium", titleAr: "عميل خامل",              descAr: `آخر شراء منذ ${rfm.daysSinceLast} يوماً — حملة إعادة استهداف`, action: "winback" });
  if (rfm.segment === "new")     recs.push({ type: "nurture",   priority: "medium", titleAr: "عميل جديد",              descAr: "أول شراء فقط — عزز الثقة بعرض ترحيبي", action: "nurture" });
  if (c.refundCount > 0 && c.refundCount / Math.max(c.totalOrders, 1) > 0.3)
    recs.push({ type: "review", priority: "high", titleAr: "نسبة استرداد مرتفعة", descAr: `${c.refundCount} مسترد من ${c.totalOrders} طلب`, action: "review" });
  if (c.totalOrders >= 3) recs.push({ type: "loyalty", priority: "low", titleAr: "مرشح لبرنامج الولاء", descAr: "نشاط منتظم — أضفه لبرنامج النقاط", action: "loyalty" });
  return recs;
}

export async function listCustomers(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const merchantId = req.merchant.id;
    const { segment, search, sort = "totalSpent", order = "desc", page = "1", limit = "20" } = req.query as Record<string, string>;

    const where: any = { merchantId };
    if (search) where.OR = [
      { name:  { contains: search, mode: "insensitive" } },
      { phone: { contains: search } },
      { email: { contains: search, mode: "insensitive" } },
    ];

    const allCustomers = await prisma.customer.findMany({ where, orderBy: { [sort]: order === "asc" ? "asc" : "desc" } });
    const withRFM      = allCustomers.map(c => ({ ...c, rfm: calcRFM(c) }));
    const filtered     = segment ? withRFM.filter(c => c.rfm.segment === segment) : withRFM;
    const skip         = (parseInt(page) - 1) * parseInt(limit);
    const paginated    = filtered.slice(skip, skip + parseInt(limit));

    const totalRevenue  = allCustomers.reduce((s, c) => s + c.totalSpent, 0);
    const totalOrders   = allCustomers.reduce((s, c) => s + c.totalOrders, 0);
    const avgLTV        = allCustomers.length > 0 ? totalRevenue / allCustomers.length : 0;
    const segmentCounts = withRFM.reduce((acc, c) => { acc[c.rfm.segment] = (acc[c.rfm.segment] || 0) + 1; return acc; }, {} as Record<string, number>);
    const topCustomers  = [...withRFM].sort((a, b) => b.totalSpent - a.totalSpent).slice(0, 5).map(c => ({ id: c.id, name: c.name, totalSpent: c.totalSpent, segment: c.rfm.segment }));

    const sixMonthsAgo = new Date(); sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const cohortRaw    = await prisma.customer.groupBy({ by: ["firstSeenAt"], where: { merchantId, firstSeenAt: { gte: sixMonthsAgo } }, _count: true });
    const cohortMap: Record<string, number> = {};
    cohortRaw.forEach(r => { const mo = new Date(r.firstSeenAt).toISOString().slice(0, 7); cohortMap[mo] = (cohortMap[mo] || 0) + r._count; });
    const cohort = Object.entries(cohortMap).map(([month, count]) => ({ month, count })).sort((a, b) => a.month.localeCompare(b.month));

    const sixtyDaysAgo = new Date(); sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const churnRate    = allCustomers.length > 0 ? Math.round((allCustomers.filter(c => new Date(c.lastSeenAt) < sixtyDaysAgo).length / allCustomers.length) * 100) : 0;

    res.json({
      success: true,
      data: {
        customers: paginated.map(c => ({
          id: c.id, customerId: c.customerId, name: c.name, phone: c.phone,
          email: c.email, city: c.city, country: c.country, tags: c.tags,
          totalSpent: c.totalSpent, totalOrders: c.totalOrders,
          avgOrderValue: c.avgOrderValue, refundCount: c.refundCount,
          lastSeenAt: c.lastSeenAt, firstSeenAt: c.firstSeenAt, rfm: c.rfm,
        })),
        pagination: { page: parseInt(page), limit: parseInt(limit), total: filtered.length, pages: Math.ceil(filtered.length / parseInt(limit)) },
        stats: { totalCustomers: allCustomers.length, totalRevenue, totalOrders, avgLTV: Math.round(avgLTV * 100) / 100, churnRate, segmentCounts, topCustomers, cohort },
      },
    });
  } catch (err) { next(err); }
}

export async function getCustomer(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const merchantId     = req.merchant.id;
    const { customerId } = req.params;
    const customer       = await prisma.customer.findFirst({ where: { id: customerId, merchantId } });
    if (!customer) {
      res.status(404).json({ error: "Customer not found" });
      return;
    }

    const rfm             = calcRFM(customer);
    const recommendations = buildRecommendations(rfm, customer);

    const relatedTx = customer.phone
      ? await prisma.transaction.findMany({ where: { merchantId, customerPhone: customer.phone }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, amount: true, currency: true, status: true, createdAt: true, method: true } })
      : [];

    const sixMonthsAgo = new Date(); sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const monthlyTx = customer.phone
      ? await prisma.transaction.findMany({ where: { merchantId, customerPhone: customer.phone, status: "SUCCESS", createdAt: { gte: sixMonthsAgo } }, select: { amount: true, createdAt: true } })
      : [];

    const monthlySpend: Record<string, number> = {};
    monthlyTx.forEach(tx => { const mo = new Date(tx.createdAt).toISOString().slice(0, 7); monthlySpend[mo] = (monthlySpend[mo] || 0) + Number(tx.amount); });
    const spendTrend = Object.entries(monthlySpend).map(([month, amount]) => ({ month, amount: Math.round(amount * 100) / 100 })).sort((a, b) => a.month.localeCompare(b.month));

    res.json({ success: true, data: { customer: { ...customer, rfm, recommendations, recentTransactions: relatedTx, spendTrend } } });
  } catch (err) { next(err); }
}

export async function upsertCustomer(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const merchantId = req.merchant.id;
    const { name, phone, email, city, country, tags, notes } = req.body;
    if (!name) {
      res.status(400).json({ error: "name is required" });
      return;
    }

    const customer = phone
      ? await prisma.customer.upsert({
          where:  { customerId: `${merchantId}_${phone}` },
          update: { name, email, city, country, tags: tags || [], notes, updatedAt: new Date() },
          create: { merchantId, name, phone, email, city, country, tags: tags || [], notes, customerId: `${merchantId}_${phone}` },
        })
      : await prisma.customer.create({ data: { merchantId, name, phone, email, city, country, tags: tags || [], notes } });

    res.status(201).json({ success: true, data: { customer } });
  } catch (err) { next(err); }
}

export async function updateCustomer(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const merchantId     = req.merchant.id;
    const { customerId } = req.params;
    const existing       = await prisma.customer.findFirst({ where: { id: customerId, merchantId } });
    if (!existing) {
      res.status(404).json({ error: "Customer not found" });
      return;
    }

    const { name, phone, email, city, country, tags, notes } = req.body;
    const customer = await prisma.customer.update({ where: { id: customerId }, data: { name, phone, email, city, country, tags, notes, updatedAt: new Date() } });
    res.json({ success: true, data: { customer } });
  } catch (err) { next(err); }
}

export async function getCustomersSummary(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const merchantId    = req.merchant.id;
    const customers     = await prisma.customer.findMany({ where: { merchantId } });
    const withRFM       = customers.map(c => ({ ...c, rfm: calcRFM(c) }));
    const segments      = withRFM.reduce((acc, c) => { acc[c.rfm.segment] = (acc[c.rfm.segment] || 0) + 1; return acc; }, {} as Record<string, number>);
    const totalRevenue  = customers.reduce((s, c) => s + c.totalSpent, 0);
    const avgLTV        = customers.length > 0 ? totalRevenue / customers.length : 0;
    const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const newThisMonth  = customers.filter(c => new Date(c.firstSeenAt) >= thirtyDaysAgo).length;
    const churnedCount  = customers.filter(c => Math.floor((Date.now() - new Date(c.lastSeenAt).getTime()) / 86400000) > 60).length;
    const churnRate     = customers.length > 0 ? Math.round((churnedCount / customers.length) * 100) : 0;
    res.json({ success: true, data: { totalCustomers: customers.length, newThisMonth, totalRevenue: Math.round(totalRevenue * 100) / 100, avgLTV: Math.round(avgLTV * 100) / 100, churnRate, segments } });
  } catch (err) { next(err); }
}
