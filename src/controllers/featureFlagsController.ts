// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Feature Flags Controller
// ─────────────────────────────────────────────────────────────

import { Response } from "express";
import { prisma } from "../config/database";
import { AuthenticatedRequest } from "../types";

// ─── Default flags (seeded if missing) ───────────────────────

export const DEFAULT_FLAGS: Record<string, {
  label: string;
  description: string;
  category: string;
  requiresExternalSetup: boolean;
}> = {
  // ── Core (always on) ──────────────────────────────────────
  payment_links:        { label: "روابط الدفع",             description: "إنشاء وإدارة روابط الدفع",              category: "core",         requiresExternalSetup: false },
  hosted_checkout:      { label: "صفحة الدفع المستضافة",    description: "صفحة دفع بهوية بصرية مخصصة",           category: "core",         requiresExternalSetup: false },
  transaction_engine:   { label: "محرك المعاملات",           description: "تتبع وإدارة المعاملات",                 category: "core",         requiresExternalSetup: false },
  settlements:          { label: "التسويات",                 description: "إدارة تسويات المدفوعات",                category: "core",         requiresExternalSetup: false },
  invoices:             { label: "الفواتير",                 description: "إنشاء وإدارة الفواتير",                 category: "core",         requiresExternalSetup: false },
  subscriptions:        { label: "الاشتراكات",               description: "إدارة الاشتراكات المتكررة",             category: "core",         requiresExternalSetup: false },
  revenue_goals:        { label: "أهداف الإيراد",            description: "تتبع أهداف الإيراد",                   category: "core",         requiresExternalSetup: false },
  expense_tracking:     { label: "تتبع المصروفات",           description: "تسجيل وتصنيف المصروفات",               category: "core",         requiresExternalSetup: false },
  customer_insights:    { label: "رؤى العملاء",              description: "تحليل سلوك العملاء وRFM",              category: "core",         requiresExternalSetup: false },

  // ── Payments ──────────────────────────────────────────────
  multi_payment_methods:   { label: "طرق الدفع المتعددة",   description: "بطاقات + Apple Pay + محافظ",            category: "payments",     requiresExternalSetup: true  },
  multi_currency_wallets:  { label: "المحافظ متعددة العملات",description: "محافظ منفصلة لكل عملة",               category: "payments",     requiresExternalSetup: false },
  fx_rates:                { label: "أسعار الصرف",           description: "تتبع وتحويل العملات",                  category: "payments",     requiresExternalSetup: false },

  // ── Optimization ─────────────────────────────────────────
  multi_gateway_routing:   { label: "توجيه متعدد البوابات",  description: "اختيار أفضل بوابة لكل معاملة",         category: "optimization", requiresExternalSetup: true  },
  smart_retry_gateway:     { label: "إعادة المحاولة الذكية", description: "إعادة المحاولة عبر بوابات مختلفة",     category: "optimization", requiresExternalSetup: true  },
  bin_intelligence:        { label: "BIN Intelligence",      description: "تحديد البنك والبوابة المثلى تلقائياً", category: "optimization", requiresExternalSetup: false },
  dynamic_checkout:        { label: "الدفع الديناميكي",      description: "تخصيص تجربة الدفع لكل عميل",          category: "optimization", requiresExternalSetup: false },
  fraud_detection:         { label: "كشف الاحتيال",          description: "تسجيل نقاط المخاطرة ورفض المشبوه",    category: "optimization", requiresExternalSetup: false },
};

// ─── Seed defaults for a new merchant ────────────────────────

async function seedDefaultFlags(merchantId: string) {
  const existing = await prisma.featureFlag.findMany({
    where: { merchantId },
    select: { key: true },
  });
  const existingKeys = new Set(existing.map((f) => f.key));

  const toCreate = Object.entries(DEFAULT_FLAGS)
    .filter(([key]) => !existingKeys.has(key))
    .map(([key, meta]) => ({
      merchantId,
      key,
      label:       meta.label,
      description: meta.description,
      category:    meta.category,
      requiresExternalSetup: meta.requiresExternalSetup,
      // Core features ON by default, optimization OFF until ready
      enabled: meta.category === "core" || key === "fx_rates" || key === "multi_currency_wallets",
    }));

  if (toCreate.length > 0) {
    await prisma.featureFlag.createMany({ data: toCreate, skipDuplicates: true });
  }
}

// ─── GET /api/feature-flags ───────────────────────────────────
// Returns all flags for this merchant (seeds defaults if first call)

export async function listFlags(req: AuthenticatedRequest, res: Response) {
  try {
    const merchantId = req.merchant.id;
    await seedDefaultFlags(merchantId);

    const flags = await prisma.featureFlag.findMany({
      where: { merchantId },
      orderBy: [{ category: "asc" }, { key: "asc" }],
    });

    // Group by category
    const grouped = flags.reduce((acc, f) => {
      if (!acc[f.category]) acc[f.category] = [];
      acc[f.category].push(f);
      return acc;
    }, {} as Record<string, typeof flags>);

    res.json({ success: true, data: { flags, grouped } });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to load feature flags" });
  }
}

// ─── PATCH /api/feature-flags/:key ───────────────────────────
// Toggle a single flag on/off

export async function updateFlag(req: AuthenticatedRequest, res: Response) {
  try {
    const merchantId = req.merchant.id;
    const { key } = req.params;
    const { enabled } = req.body as { enabled: boolean };

    if (typeof enabled !== "boolean") {
      return res.status(400).json({ success: false, message: "enabled must be boolean" });
    }

    await seedDefaultFlags(merchantId);

    const flag = await prisma.featureFlag.findFirst({ where: { merchantId, key } });
    if (!flag) {
      return res.status(404).json({ success: false, message: "Flag not found" });
    }

    const updated = await prisma.featureFlag.update({
      where: { id: flag.id },
      data:  { enabled, updatedAt: new Date() },
    });

    res.json({
      success: true,
      data:    updated,
      message: `${key} ${enabled ? "مفعّل" : "معطّل"}`,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to update flag" });
  }
}

// ─── PATCH /api/feature-flags/bulk ───────────────────────────
// Toggle multiple flags at once

export async function bulkUpdateFlags(req: AuthenticatedRequest, res: Response) {
  try {
    const merchantId = req.merchant.id;
    const { updates } = req.body as { updates: { key: string; enabled: boolean }[] };

    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ success: false, message: "updates array required" });
    }

    await seedDefaultFlags(merchantId);

    const results = await Promise.all(
      updates.map(async ({ key, enabled }) => {
        const flag = await prisma.featureFlag.findFirst({ where: { merchantId, key } });
        if (!flag) return { key, success: false };
        await prisma.featureFlag.update({
          where: { id: flag.id },
          data:  { enabled, updatedAt: new Date() },
        });
        return { key, enabled, success: true };
      })
    );

    res.json({ success: true, data: results });
  } catch (err) {
    res.status(500).json({ success: false, message: "Bulk update failed" });
  }
}

// ─── GET /api/feature-flags/map ──────────────────────────────
// Lightweight key→boolean map (used by app on startup)

export async function getFlagsMap(req: AuthenticatedRequest, res: Response) {
  try {
    const merchantId = req.merchant.id;
    await seedDefaultFlags(merchantId);

    const flags = await prisma.featureFlag.findMany({
      where:  { merchantId },
      select: { key: true, enabled: true },
    });

    const map = Object.fromEntries(flags.map((f) => [f.key, f.enabled]));
    res.json({ success: true, data: map });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to load flags map" });
  }
}
