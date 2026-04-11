import { Request, Response } from "express";
import { prisma } from "../config/database";
import { AuthenticatedRequest } from "../types";

// ─── Generate insights from real data ────────────────────────
async function generateInsights(merchantId: string): Promise<{
  category: string; title: string; description: string;
  impact: string; action: string; priority: number;
}[]> {
  const now        = new Date();
  const today      = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday  = new Date(today.getTime() - 864e5);
  const last7      = new Date(now.getTime() -  7 * 864e5);
  const last30     = new Date(now.getTime() - 30 * 864e5);
  const prev30     = new Date(now.getTime() - 60 * 864e5);

  const insights: { category: string; title: string; description: string; impact: string; action: string; priority: number }[] = [];

  // 1. Success rate drop
  const [curr7Total, curr7Success, prev7Total, prev7Success] = await Promise.all([
    prisma.transaction.count({ where: { merchantId, createdAt: { gte: last7 } } }),
    prisma.transaction.count({ where: { merchantId, status: "SUCCESS", createdAt: { gte: last7 } } }),
    prisma.transaction.count({ where: { merchantId, createdAt: { gte: new Date(now.getTime() - 14 * 864e5), lt: last7 } } }),
    prisma.transaction.count({ where: { merchantId, status: "SUCCESS", createdAt: { gte: new Date(now.getTime() - 14 * 864e5), lt: last7 } } }),
  ]);
  const currRate = curr7Total > 0 ? (curr7Success / curr7Total) * 100 : 0;
  const prevRate = prev7Total > 0 ? (prev7Success / prev7Total) * 100 : 0;
  if (prevRate > 0 && currRate < prevRate - 5) {
    insights.push({ category: "success_rate", title: "انخفاض معدل النجاح", description: `معدل النجاح انخفض من ${prevRate.toFixed(1)}% إلى ${currRate.toFixed(1)}% هذا الأسبوع`, impact: "high", action: "راجع بوابات الدفع وأسباب الرفض", priority: 10 });
  }

  // 2. Revenue trend
  const [rev30, revPrev30] = await Promise.all([
    prisma.transaction.aggregate({ where: { merchantId, status: "SUCCESS", createdAt: { gte: last30 } }, _sum: { amount: true } }),
    prisma.transaction.aggregate({ where: { merchantId, status: "SUCCESS", createdAt: { gte: prev30, lt: last30 } }, _sum: { amount: true } }),
  ]);
  const r30 = Number(rev30._sum.amount ?? 0);
  const rp30 = Number(revPrev30._sum.amount ?? 0);
  if (rp30 > 0) {
    const change = ((r30 - rp30) / rp30) * 100;
    if (change > 20)  insights.push({ category: "revenue", title: "نمو قوي في الإيرادات 🚀", description: `الإيرادات ارتفعت ${change.toFixed(1)}% مقارنة بالشهر الماضي`, impact: "positive", action: "استمر في نفس الاستراتيجية", priority: 5 });
    if (change < -15) insights.push({ category: "revenue", title: "تراجع في الإيرادات ⚠️", description: `الإيرادات انخفضت ${Math.abs(change).toFixed(1)}% مقارنة بالشهر الماضي`, impact: "high", action: "راجع حملاتك التسويقية وقنوات البيع", priority: 9 });
  }

  // 3. At-risk customers
  const atRisk = await prisma.customer.count({
    where: { merchantId, lastSeenAt: { gte: new Date(Date.now() - 90 * 864e5), lt: new Date(Date.now() - 60 * 864e5) } },
  });
  if (atRisk > 5) {
    insights.push({ category: "customers", title: `${atRisk} عميل في خطر`, description: `${atRisk} عميل لم يشتروا منذ 60-90 يوماً`, impact: "medium", action: "أرسل حملة استرداد الآن", priority: 7 });
  }

  // 4. High pending transactions
  const pending = await prisma.transaction.count({ where: { merchantId, status: "PENDING" } });
  if (pending > 20) {
    insights.push({ category: "operations", title: `${pending} معاملة معلّقة`, description: `يوجد ${pending} معاملة بحالة PENDING تحتاج مراجعة`, impact: "medium", action: "راجع المعاملات المعلّقة وتواصل مع البوابات", priority: 6 });
  }

  // 5. New customers this month
  const newThisMonth = await prisma.customer.count({
    where: { merchantId, firstSeenAt: { gte: new Date(now.getFullYear(), now.getMonth(), 1) } },
  });
  if (newThisMonth > 0) {
    insights.push({ category: "growth", title: `${newThisMonth} عميل جديد هذا الشهر`, description: `استقطبت ${newThisMonth} عميل جديد — فرصة للـ onboarding`, impact: "positive", action: "أرسل رسالة ترحيب وعرض أول شراء", priority: 3 });
  }

  return insights.sort((a, b) => b.priority - a.priority);
}

export const getInsights = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { refresh = "false" } = req.query as Record<string, string>;

    if (refresh === "true") {
      await prisma.$executeRawUnsafe(
        `DELETE FROM smart_insights WHERE "merchantId" = $1 AND ("expiresAt" IS NULL OR "expiresAt" > NOW())`,
        merchantId
      );
    }

    // Check existing
    const existing = await prisma.$queryRawUnsafe<Array<{
      id: string; category: string; title: string; description: string;
      impact: string; action: string; priority: number; "isRead": boolean; "createdAt": Date;
    }>>(
      `SELECT * FROM smart_insights WHERE "merchantId" = $1 AND ("expiresAt" IS NULL OR "expiresAt" > NOW()) ORDER BY priority DESC LIMIT 20`,
      merchantId
    );

    if (existing.length > 0 && refresh !== "true") {
      res.json({ success: true, data: { insights: existing, generated: false } });
      return;
    }

    // Generate fresh
    const generated = await generateInsights(merchantId);
    const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000); // 6 hours

    await prisma.$executeRawUnsafe(
      `DELETE FROM smart_insights WHERE "merchantId" = $1`, merchantId
    );

    for (const ins of generated) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO smart_insights (id, "merchantId", category, title, description, impact, action, priority, "expiresAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        crypto.randomUUID(), merchantId, ins.category, ins.title, ins.description, ins.impact, ins.action, ins.priority, expiresAt
      );
    }

    res.json({ success: true, data: { insights: generated, generated: true } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch insights" });
    return;
  }
};

export const markInsightRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { id } = req.params;
    await prisma.$executeRawUnsafe(
      `UPDATE smart_insights SET "isRead" = true WHERE id = $1 AND "merchantId" = $2`, id, merchantId
    );
    res.json({ success: true, data: { updated: true } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to mark insight" });
    return;
  }
};

export const markAllInsightsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    await prisma.$executeRawUnsafe(
      `UPDATE smart_insights SET "isRead" = true WHERE "merchantId" = $1`, merchantId
    );
    res.json({ success: true, data: { updated: true } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to mark all insights" });
    return;
  }
};
