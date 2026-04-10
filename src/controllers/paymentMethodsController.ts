import { Request, Response } from "express";
import { prisma } from "../config/database";

const ALL_METHODS = [
  { method: "CREDIT_CARD",   nameAr: "بطاقة ائتمانية",       nameEn: "Credit Card",     icon: "💳", popular: true  },
  { method: "DEBIT_CARD",    nameAr: "بطاقة مدى",            nameEn: "Debit Card",      icon: "💳", popular: true  },
  { method: "APPLE_PAY",     nameAr: "Apple Pay",             nameEn: "Apple Pay",       icon: "🍎", popular: true  },
  { method: "GOOGLE_PAY",    nameAr: "Google Pay",            nameEn: "Google Pay",      icon: "🔵", popular: true  },
  { method: "BANK_TRANSFER", nameAr: "تحويل بنكي",           nameEn: "Bank Transfer",   icon: "🏦", popular: false },
  { method: "STC_PAY",       nameAr: "STC Pay",               nameEn: "STC Pay",         icon: "📱", popular: true  },
  { method: "MADA",          nameAr: "مدى",                   nameEn: "Mada",            icon: "💚", popular: true  },
  { method: "TAMARA",        nameAr: "تمارا (اشتري الآن)",   nameEn: "Tamara (BNPL)",   icon: "🟣", popular: false },
  { method: "TABBY",         nameAr: "تابي (اشتري الآن)",    nameEn: "Tabby (BNPL)",    icon: "🟡", popular: false },
  { method: "CRYPTO",        nameAr: "كريبتو",                nameEn: "Crypto",          icon: "₿",  popular: false },
  { method: "COD",           nameAr: "الدفع عند الاستلام",   nameEn: "Cash on Delivery",icon: "📦", popular: false },
  { method: "WALLET",        nameAr: "محفظة إلكترونية",      nameEn: "E-Wallet",        icon: "👛", popular: false },
];

export async function listMethods(req: Request, res: Response) {
  try {
    const merchantId = (req as any).merchant?.id;
    const configs = await prisma.paymentMethodConfig.findMany({ where: { merchantId }, orderBy: { displayOrder: "asc" } });
    const configMap = new Map(configs.map(c => [c.method, c]));
    const methods = ALL_METHODS.map((m, index) => {
      const config = configMap.get(m.method as any);
      return { method: m.method, nameAr: m.nameAr, nameEn: m.nameEn, icon: m.icon, popular: m.popular, status: config?.status || "INACTIVE", isActive: config?.status === "ACTIVE", displayName: config?.displayName || null, displayOrder: config?.displayOrder ?? index, isDefault: config?.isDefault || false, countries: config?.countries || [], currencies: config?.currencies || [], minAmount: config?.minAmount || null, maxAmount: config?.maxAmount || null, feePercent: config?.feePercent || null, feeFixed: config?.feeFixed || null, configId: config?.id || null };
    });
    const activeMethods = methods.filter(m => m.isActive);
    return res.json({ success: true, data: { methods, activeMethods, activeCount: activeMethods.length, totalCount: methods.length } });
  } catch { return res.status(500).json({ success: false, error: "Server error" }); }
}

export async function updateMethod(req: Request, res: Response) {
  try {
    const merchantId = (req as any).merchant?.id; const { method } = req.params;
    const { status, displayName, displayOrder, isDefault, countries, currencies, minAmount, maxAmount, feePercent, feeFixed, config } = req.body;
    const validMethods = ALL_METHODS.map(m => m.method);
    if (!validMethods.includes(method)) { return res.status(400).json({ success: false, error: "Invalid payment method" }); }
    const updated = await prisma.paymentMethodConfig.upsert({ where: { merchantId_method: { merchantId, method: method as any } }, update: { ...(status !== undefined && { status }), ...(displayName !== undefined && { displayName }), ...(displayOrder !== undefined && { displayOrder }), ...(isDefault !== undefined && { isDefault }), ...(countries !== undefined && { countries }), ...(currencies !== undefined && { currencies }), ...(minAmount !== undefined && { minAmount }), ...(maxAmount !== undefined && { maxAmount }), ...(feePercent !== undefined && { feePercent }), ...(feeFixed !== undefined && { feeFixed }), ...(config !== undefined && { config }) }, create: { merchantId, method: method as any, status: status || "INACTIVE", displayName: displayName || null, displayOrder: displayOrder || 0, isDefault: isDefault || false, countries: countries || [], currencies: currencies || [], minAmount: minAmount || null, maxAmount: maxAmount || null, feePercent: feePercent || null, feeFixed: feeFixed || null, config: config || null } });
    return res.json({ success: true, data: { config: updated } });
  } catch { return res.status(500).json({ success: false, error: "Server error" }); }
}

export async function toggleMethod(req: Request, res: Response) {
  try {
    const merchantId = (req as any).merchant?.id; const { method } = req.params;
    const validMethods = ALL_METHODS.map(m => m.method);
    if (!validMethods.includes(method)) { return res.status(400).json({ success: false, error: "Invalid payment method" }); }
    const existing = await prisma.paymentMethodConfig.findUnique({ where: { merchantId_method: { merchantId, method: method as any } } });
    const newStatus = existing?.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    const updated = await prisma.paymentMethodConfig.upsert({ where: { merchantId_method: { merchantId, method: method as any } }, update: { status: newStatus }, create: { merchantId, method: method as any, status: newStatus, countries: [], currencies: [] } });
    return res.json({ success: true, data: { method, status: updated.status, isActive: updated.status === "ACTIVE" } });
  } catch { return res.status(500).json({ success: false, error: "Server error" }); }
}

export async function getMethodsPublic(req: Request, res: Response) {
  try {
    const { merchantId } = req.params;
    const merchant = await prisma.merchant.findFirst({ where: { merchantId }, select: { id: true } });
    if (!merchant) { return res.status(404).json({ success: false, error: "Merchant not found" }); }
    const configs = await prisma.paymentMethodConfig.findMany({ where: { merchantId: merchant.id, status: "ACTIVE" }, orderBy: { displayOrder: "asc" } });
    const activeMethods = configs.map(c => { const meta = ALL_METHODS.find(m => m.method === c.method); return { method: c.method, nameAr: meta?.nameAr || c.method, nameEn: meta?.nameEn || c.method, icon: meta?.icon || "💳", displayName: c.displayName || null, isDefault: c.isDefault, currencies: c.currencies, minAmount: c.minAmount, maxAmount: c.maxAmount }; });
    return res.json({ success: true, data: { methods: activeMethods } });
  } catch { return res.status(500).json({ success: false, error: "Server error" }); }
}

// ─────────────────────────────────────────────────────────────
// ELITE #19: Success Rates per Method per Country
// ─────────────────────────────────────────────────────────────

// GET /api/payment-methods/success-rates
// يُظهر نسب نجاح كل طريقة دفع لكل دولة بناءً على بيانات حقيقية
export async function getSuccessRates(req: Request, res: Response) {
  try {
    const merchantId = (req as any).merchant?.id;
    const days = parseInt((req.query.days as string) || '30');
    const since = new Date(Date.now() - days * 86400000);

    const transactions = await prisma.transaction.findMany({
      where: { merchantId, createdAt: { gte: since } },
      select: { method: true, country: true, status: true, amount: true, currency: true },
    });

    // تجميع حسب (method, country)
    const matrix: Record<string, Record<string, { success: number; total: number; volume: number }>> = {};
    transactions.forEach(tx => {
      const m = String(tx.method); const c = tx.country || 'UNKNOWN';
      if (!matrix[m]) matrix[m] = {};
      if (!matrix[m][c]) matrix[m][c] = { success: 0, total: 0, volume: 0 };
      matrix[m][c].total++;
      if (tx.status === 'SUCCESS') { matrix[m][c].success++; matrix[m][c].volume += Number(tx.amount); }
    });

    // بناء النتيجة
    const successRates = Object.entries(matrix).map(([method, countries]) => {
      const methodMeta = ALL_METHODS.find(m => m.method === method);
      const byCountry = Object.entries(countries).map(([country, data]) => ({
        country, successRate: data.total > 0 ? Math.round((data.success / data.total) * 100) : 0,
        total: data.total, volume: Math.round(data.volume), successCount: data.success,
      })).sort((a, b) => b.successRate - a.successRate);
      const totalAll = byCountry.reduce((s, c) => s + c.total, 0);
      const successAll = byCountry.reduce((s, c) => s + c.successCount, 0);
      return {
        method, nameAr: methodMeta?.nameAr || method, icon: methodMeta?.icon || '💳',
        overallSuccessRate: totalAll > 0 ? Math.round((successAll / totalAll) * 100) : 0,
        totalTransactions: totalAll, byCountry,
        bestCountry: byCountry[0]?.country || null, bestRate: byCountry[0]?.successRate || 0,
      };
    }).sort((a, b) => b.overallSuccessRate - a.overallSuccessRate);

    return res.json({ success: true, data: { period: `${days}d`, successRates, totalMethods: successRates.length, topMethod: successRates[0] || null } });
  } catch { return res.status(500).json({ success: false, error: "Server error" }); }
}

// GET /api/payment-methods/country-recommendations/:country
// يُوصي بأفضل طرق الدفع لدولة معينة بناءً على بيانات المرتشنت
export async function getCountryRecommendations(req: Request, res: Response) {
  try {
    const merchantId = (req as any).merchant?.id; const { country } = req.params;
    const since = new Date(Date.now() - 30 * 86400000);

    // بيانات حقيقية من المرتشنت
    const txData = await prisma.transaction.findMany({
      where: { merchantId, country, createdAt: { gte: since } },
      select: { method: true, status: true, amount: true },
    });

    const methodStats: Record<string, { success: number; total: number; volume: number }> = {};
    txData.forEach(tx => {
      const m = String(tx.method);
      if (!methodStats[m]) methodStats[m] = { success: 0, total: 0, volume: 0 };
      methodStats[m].total++;
      if (tx.status === 'SUCCESS') { methodStats[m].success++; methodStats[m].volume += Number(tx.amount); }
    });

    // Static recommendations للدول الرئيسية
    const staticRecs: Record<string, string[]> = {
      SA: ['MADA', 'STC_PAY', 'CREDIT_CARD', 'APPLE_PAY', 'TAMARA'],
      AE: ['CREDIT_CARD', 'APPLE_PAY', 'GOOGLE_PAY', 'BANK_TRANSFER'],
      TR: ['CREDIT_CARD', 'BANK_TRANSFER'],
      KW: ['CREDIT_CARD', 'APPLE_PAY'],
      QA: ['CREDIT_CARD', 'APPLE_PAY'],
      EG: ['CREDIT_CARD', 'MEEZA', 'COD'],
      IQ: ['CREDIT_CARD', 'COD'],
    };

    const recommended = (staticRecs[country] || ['CREDIT_CARD', 'BANK_TRANSFER']).map(method => {
      const meta = ALL_METHODS.find(m => m.method === method);
      const stats = methodStats[method];
      return {
        method, nameAr: meta?.nameAr || method, icon: meta?.icon || '💳',
        successRate: stats ? (stats.total > 0 ? Math.round((stats.success / stats.total) * 100) : null) : null,
        transactionsInCountry: stats?.total || 0,
        dataSource: stats ? 'merchant_data' : 'regional_default',
      };
    });

    return res.json({ success: true, data: { country, recommended, totalTxInCountry: txData.length, period: '30d' } });
  } catch { return res.status(500).json({ success: false, error: "Server error" }); }
}

// GET /api/payment-methods/localization-map
// خريطة شاملة: كل دولة + طرق الدفع + نسب النجاح العالمية
export async function getLocalizationMap(_req: Request, res: Response) {
  try {
    const localizationMap = [
      { country: 'SA', flag: '🇸🇦', name: 'Saudi Arabia', currency: 'SAR', methods: [ { method: 'MADA', icon: '💚', globalSuccessRate: 94, note: 'Local debit network — only works with SA cards' }, { method: 'STC_PAY', icon: '📱', globalSuccessRate: 92, note: 'Popular mobile wallet in KSA' }, { method: 'CREDIT_CARD', icon: '💳', globalSuccessRate: 91, note: 'Visa/Mastercard — wide coverage' }, { method: 'APPLE_PAY', icon: '🍎', globalSuccessRate: 93, note: 'High conversion for iPhone users' }, { method: 'TAMARA', icon: '🟣', globalSuccessRate: 88, note: 'BNPL — boosts AOV by 30%' }, ] },
      { country: 'AE', flag: '🇦🇪', name: 'UAE', currency: 'AED', methods: [ { method: 'CREDIT_CARD', icon: '💳', globalSuccessRate: 93, note: 'Highest success rate in UAE' }, { method: 'APPLE_PAY', icon: '🍎', globalSuccessRate: 92, note: 'Very popular in Dubai' }, { method: 'GOOGLE_PAY', icon: '🔵', globalSuccessRate: 89, note: 'Growing adoption' }, ] },
      { country: 'TR', flag: '🇹🇷', name: 'Turkey', currency: 'TRY', methods: [ { method: 'CREDIT_CARD', icon: '💳', globalSuccessRate: 90, note: 'Installments (taksit) very popular' }, { method: 'BANK_TRANSFER', icon: '🏦', globalSuccessRate: 88, note: 'EFT/Havale — preferred for large amounts' }, ] },
      { country: 'KW', flag: '🇰🇼', name: 'Kuwait', currency: 'KWD', methods: [ { method: 'CREDIT_CARD', icon: '💳', globalSuccessRate: 91, note: 'Visa/MC dominant' }, { method: 'APPLE_PAY', icon: '🍎', globalSuccessRate: 90, note: 'High iPhone penetration in Kuwait' }, ] },
      { country: 'QA', flag: '🇶🇦', name: 'Qatar', currency: 'QAR', methods: [ { method: 'CREDIT_CARD', icon: '💳', globalSuccessRate: 92, note: 'Premium card market' }, { method: 'APPLE_PAY', icon: '🍎', globalSuccessRate: 91, note: 'Widely used' }, ] },
      { country: 'EG', flag: '🇪🇬', name: 'Egypt', currency: 'EGP', methods: [ { method: 'CREDIT_CARD', icon: '💳', globalSuccessRate: 85, note: 'Growing online card usage' }, { method: 'COD', icon: '📦', globalSuccessRate: 95, note: 'Still dominant — 60% of e-commerce' }, { method: 'MEEZA', icon: '💚', globalSuccessRate: 82, note: 'National card scheme' }, ] },
      { country: 'IQ', flag: '🇮🇶', name: 'Iraq', currency: 'IQD', methods: [ { method: 'COD', icon: '📦', globalSuccessRate: 94, note: 'Dominant payment method — 70%+ of orders' }, { method: 'CREDIT_CARD', icon: '💳', globalSuccessRate: 78, note: 'Limited penetration but growing' }, ] },
    ];
    return res.json({ success: true, data: { localizationMap, totalCountries: localizationMap.length } });
  } catch { return res.status(500).json({ success: false, error: "Server error" }); }
}
