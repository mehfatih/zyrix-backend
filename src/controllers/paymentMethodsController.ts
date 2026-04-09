import { Request, Response } from "express";
import { prisma } from "../config/database";

const ALL_METHODS = [
  { method: "CREDIT_CARD",  nameAr: "بطاقة ائتمانية",       nameEn: "Credit Card",    icon: "💳", popular: true  },
  { method: "DEBIT_CARD",   nameAr: "بطاقة مدى",            nameEn: "Debit Card",     icon: "💳", popular: true  },
  { method: "APPLE_PAY",    nameAr: "Apple Pay",             nameEn: "Apple Pay",      icon: "🍎", popular: true  },
  { method: "GOOGLE_PAY",   nameAr: "Google Pay",            nameEn: "Google Pay",     icon: "🔵", popular: true  },
  { method: "BANK_TRANSFER",nameAr: "تحويل بنكي",           nameEn: "Bank Transfer",  icon: "🏦", popular: false },
  { method: "STC_PAY",      nameAr: "STC Pay",               nameEn: "STC Pay",        icon: "📱", popular: true  },
  { method: "MADA",         nameAr: "مدى",                   nameEn: "Mada",           icon: "💚", popular: true  },
  { method: "TAMARA",       nameAr: "تمارا (اشتري الآن)",   nameEn: "Tamara (BNPL)",  icon: "🟣", popular: false },
  { method: "TABBY",        nameAr: "تابي (اشتري الآن)",    nameEn: "Tabby (BNPL)",   icon: "🟡", popular: false },
  { method: "CRYPTO",       nameAr: "كريبتو",                nameEn: "Crypto",         icon: "₿",  popular: false },
  { method: "COD",          nameAr: "الدفع عند الاستلام",   nameEn: "Cash on Delivery",icon: "📦", popular: false },
  { method: "WALLET",       nameAr: "محفظة إلكترونية",      nameEn: "E-Wallet",       icon: "👛", popular: false },
];

// ─── List all methods with merchant config ────────────────────
export async function listMethods(req: Request, res: Response) {
  try {
    const merchantId = (req as any).merchant?.id;

    const configs = await prisma.paymentMethodConfig.findMany({
      where: { merchantId },
      orderBy: { displayOrder: "asc" },
    });

    const configMap = new Map(configs.map(c => [c.method, c]));

    const methods = ALL_METHODS.map((m, index) => {
      const config = configMap.get(m.method as any);
      return {
        method:       m.method,
        nameAr:       m.nameAr,
        nameEn:       m.nameEn,
        icon:         m.icon,
        popular:      m.popular,
        status:       config?.status       || "INACTIVE",
        isActive:     config?.status       === "ACTIVE",
        displayName:  config?.displayName  || null,
        displayOrder: config?.displayOrder ?? index,
        isDefault:    config?.isDefault    || false,
        countries:    config?.countries    || [],
        currencies:   config?.currencies   || [],
        minAmount:    config?.minAmount    || null,
        maxAmount:    config?.maxAmount    || null,
        feePercent:   config?.feePercent   || null,
        feeFixed:     config?.feeFixed     || null,
        configId:     config?.id           || null,
      };
    });

    const activeMethods = methods.filter(m => m.isActive);

    return res.json({
      success: true,
      data: {
        methods,
        activeMethods,
        activeCount: activeMethods.length,
        totalCount:  methods.length,
      },
    });
  } catch {
    return res.status(500).json({ success: false, error: "Server error" });
  }
}

// ─── Update method config ─────────────────────────────────────
export async function updateMethod(req: Request, res: Response) {
  try {
    const merchantId = (req as any).merchant?.id;
    const { method }  = req.params;
    const {
      status, displayName, displayOrder, isDefault,
      countries, currencies, minAmount, maxAmount,
      feePercent, feeFixed, config,
    } = req.body;

    const validMethods = ALL_METHODS.map(m => m.method);
    if (!validMethods.includes(method)) {
      return res.status(400).json({ success: false, error: "Invalid payment method" });
    }

    const updated = await prisma.paymentMethodConfig.upsert({
      where: { merchantId_method: { merchantId, method: method as any } },
      update: {
        ...(status       !== undefined && { status }),
        ...(displayName  !== undefined && { displayName }),
        ...(displayOrder !== undefined && { displayOrder }),
        ...(isDefault    !== undefined && { isDefault }),
        ...(countries    !== undefined && { countries }),
        ...(currencies   !== undefined && { currencies }),
        ...(minAmount    !== undefined && { minAmount }),
        ...(maxAmount    !== undefined && { maxAmount }),
        ...(feePercent   !== undefined && { feePercent }),
        ...(feeFixed     !== undefined && { feeFixed }),
        ...(config       !== undefined && { config }),
      },
      create: {
        merchantId,
        method:       method as any,
        status:       status       || "INACTIVE",
        displayName:  displayName  || null,
        displayOrder: displayOrder || 0,
        isDefault:    isDefault    || false,
        countries:    countries    || [],
        currencies:   currencies   || [],
        minAmount:    minAmount    || null,
        maxAmount:    maxAmount    || null,
        feePercent:   feePercent   || null,
        feeFixed:     feeFixed     || null,
        config:       config       || null,
      },
    });

    return res.json({ success: true, data: { config: updated } });
  } catch {
    return res.status(500).json({ success: false, error: "Server error" });
  }
}

// ─── Toggle method active/inactive ───────────────────────────
export async function toggleMethod(req: Request, res: Response) {
  try {
    const merchantId = (req as any).merchant?.id;
    const { method }  = req.params;

    const validMethods = ALL_METHODS.map(m => m.method);
    if (!validMethods.includes(method)) {
      return res.status(400).json({ success: false, error: "Invalid payment method" });
    }

    const existing = await prisma.paymentMethodConfig.findUnique({
      where: { merchantId_method: { merchantId, method: method as any } },
    });

    const newStatus = existing?.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";

    const updated = await prisma.paymentMethodConfig.upsert({
      where: { merchantId_method: { merchantId, method: method as any } },
      update: { status: newStatus },
      create: {
        merchantId,
        method:    method as any,
        status:    newStatus,
        countries: [],
        currencies: [],
      },
    });

    return res.json({
      success: true,
      data: { method, status: updated.status, isActive: updated.status === "ACTIVE" },
    });
  } catch {
    return res.status(500).json({ success: false, error: "Server error" });
  }
}

// ─── Public: get active methods for checkout page ─────────────
export async function getMethodsPublic(req: Request, res: Response) {
  try {
    const { merchantId } = req.params;

    const merchant = await prisma.merchant.findFirst({
      where: { merchantId },
      select: { id: true },
    });

    if (!merchant) {
      return res.status(404).json({ success: false, error: "Merchant not found" });
    }

    const configs = await prisma.paymentMethodConfig.findMany({
      where: { merchantId: merchant.id, status: "ACTIVE" },
      orderBy: { displayOrder: "asc" },
    });

    const activeMethods = configs.map(c => {
      const meta = ALL_METHODS.find(m => m.method === c.method);
      return {
        method:      c.method,
        nameAr:      meta?.nameAr  || c.method,
        nameEn:      meta?.nameEn  || c.method,
        icon:        meta?.icon    || "💳",
        displayName: c.displayName || null,
        isDefault:   c.isDefault,
        currencies:  c.currencies,
        minAmount:   c.minAmount,
        maxAmount:   c.maxAmount,
      };
    });

    return res.json({ success: true, data: { methods: activeMethods } });
  } catch {
    return res.status(500).json({ success: false, error: "Server error" });
  }
}
