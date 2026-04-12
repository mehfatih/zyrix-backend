// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Admin Features / Feature Flags Service
// ─────────────────────────────────────────────────────────────
import { prisma } from "../../config/database";

export const AVAILABLE_FEATURES = [
  { key: "paymentLinks",  label: "روابط الدفع",        category: "payments"  },
  { key: "cod",           label: "الدفع عند الاستلام",  category: "payments"  },
  { key: "invoices",      label: "الفواتير",            category: "finance"   },
  { key: "expenses",      label: "المصروفات",           category: "finance"   },
  { key: "analytics",     label: "التحليلات",           category: "insights"  },
  { key: "revenueGoals",  label: "أهداف الإيراد",       category: "insights"  },
  { key: "teamAccounts",  label: "إدارة الفريق",        category: "admin"     },
  { key: "apiKeys",       label: "API Keys",            category: "developer" },
  { key: "webhooks",      label: "Webhooks",            category: "developer" },
  { key: "subscriptions", label: "الاشتراكات",          category: "payments"  },
  { key: "transfers",     label: "التحويلات",           category: "finance"   },
  { key: "settlements",   label: "التسويات",            category: "finance"   },
  { key: "refunds",       label: "الاسترداد",           category: "payments"  },
  { key: "disputes",      label: "النزاعات",            category: "payments"  },
  { key: "wallets",       label: "المحافظ",             category: "finance"   },
];

const PLAN_FEATURES: Record<string, string[]> = {
  starter:    ["paymentLinks", "analytics"],
  growth:     ["paymentLinks", "analytics", "cod", "invoices", "expenses", "revenueGoals"],
  elite:      AVAILABLE_FEATURES.map((f) => f.key),
  enterprise: AVAILABLE_FEATURES.map((f) => f.key),
};

export const adminFeaturesService = {
  async getMerchantFeatures(merchantId: string) {
    const flags = await prisma.featureFlag.findMany({
      where: { merchantId },
      select: { key: true, label: true, enabled: true, category: true },
    });

    if (flags.length === 0) {
      return AVAILABLE_FEATURES.map((f) => ({ ...f, enabled: false }));
    }

    return flags;
  },

  async updateMerchantFeatures(
    merchantId: string,
    features: { key: string; enabled: boolean }[]
  ) {
    const results = await Promise.all(
      features.map((f) => {
        const meta = AVAILABLE_FEATURES.find((af) => af.key === f.key);
        return prisma.featureFlag.upsert({
          where: { merchantId_key: { merchantId, key: f.key } },
          update: { enabled: f.enabled },
          create: {
            merchantId,
            key: f.key,
            label: meta?.label ?? f.key,
            category: meta?.category ?? "core",
            enabled: f.enabled,
          },
        });
      })
    );
    return results;
  },

  async applyPlanFeatures(merchantId: string, plan: string) {
    const enabledKeys = PLAN_FEATURES[plan] ?? PLAN_FEATURES.starter;
    const features = AVAILABLE_FEATURES.map((f) => ({
      key: f.key,
      enabled: enabledKeys.includes(f.key),
    }));
    return this.updateMerchantFeatures(merchantId, features);
  },

  async getMerchantSubscription(merchantId: string) {
    return prisma.merchantSubscription.findUnique({ where: { merchantId } });
  },

  async updateMerchantSubscription(
    merchantId: string,
    data: { plan?: string; status?: string; endDate?: Date }
  ) {
    const existing = await prisma.merchantSubscription.findUnique({
      where: { merchantId },
    });

    if (existing) {
      return prisma.merchantSubscription.update({
        where: { merchantId },
        data,
      });
    }

    return prisma.merchantSubscription.create({
      data: {
        merchantId,
        plan: data.plan ?? "starter",
        status: data.status ?? "active",
        startDate: new Date(),
        endDate: data.endDate,
      },
    });
  },
};
