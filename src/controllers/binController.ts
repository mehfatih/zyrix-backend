import { Response } from 'express';
import { prisma } from '../config/database';
import { AuthenticatedRequest } from '../types';

// BIN database محلي لأشهر البطاقات في MENA وتركيا
const BIN_DATABASE: Record<string, any> = {
  // MADA — السعودية
  '446404': { cardBrand: 'MADA',       cardType: 'DEBIT',   bankName: 'Al Rajhi Bank',      bankCountry: 'Saudi Arabia', bankCountryCode: 'SA', currency: 'SAR', recommendedGateway: 'tap',    successRateHint: 95.0 },
  '588845': { cardBrand: 'MADA',       cardType: 'DEBIT',   bankName: 'SNB',                bankCountry: 'Saudi Arabia', bankCountryCode: 'SA', currency: 'SAR', recommendedGateway: 'tap',    successRateHint: 94.5 },
  '968208': { cardBrand: 'MADA',       cardType: 'DEBIT',   bankName: 'Riyad Bank',         bankCountry: 'Saudi Arabia', bankCountryCode: 'SA', currency: 'SAR', recommendedGateway: 'tap',    successRateHint: 93.8 },
  '455708': { cardBrand: 'MADA',       cardType: 'DEBIT',   bankName: 'Saudi Fransi',       bankCountry: 'Saudi Arabia', bankCountryCode: 'SA', currency: 'SAR', recommendedGateway: 'tap',    successRateHint: 93.0 },
  // VISA/MC — الإمارات
  '414720': { cardBrand: 'VISA',       cardType: 'CREDIT',  bankName: 'Emirates NBD',       bankCountry: 'UAE',          bankCountryCode: 'AE', currency: 'AED', recommendedGateway: 'stripe', successRateHint: 96.2 },
  '521324': { cardBrand: 'MASTERCARD', cardType: 'CREDIT',  bankName: 'First Abu Dhabi',    bankCountry: 'UAE',          bankCountryCode: 'AE', currency: 'AED', recommendedGateway: 'stripe', successRateHint: 95.5 },
  '426428': { cardBrand: 'VISA',       cardType: 'DEBIT',   bankName: 'ADCB',               bankCountry: 'UAE',          bankCountryCode: 'AE', currency: 'AED', recommendedGateway: 'tap',    successRateHint: 94.0 },
  // قطر والكويت
  '453978': { cardBrand: 'VISA',       cardType: 'DEBIT',   bankName: 'QNB',                bankCountry: 'Qatar',        bankCountryCode: 'QA', currency: 'QAR', recommendedGateway: 'tap',    successRateHint: 92.0 },
  '539983': { cardBrand: 'MASTERCARD', cardType: 'CREDIT',  bankName: 'NBK',                bankCountry: 'Kuwait',       bankCountryCode: 'KW', currency: 'KWD', recommendedGateway: 'tap',    successRateHint: 93.5 },
  // تركيا
  '375987': { cardBrand: 'TROY',       cardType: 'CREDIT',  bankName: 'Ziraat Bank',        bankCountry: 'Turkey',       bankCountryCode: 'TR', currency: 'TRY', recommendedGateway: 'iyzico', successRateHint: 91.0 },
  '402365': { cardBrand: 'VISA',       cardType: 'CREDIT',  bankName: 'Garanti BBVA',       bankCountry: 'Turkey',       bankCountryCode: 'TR', currency: 'TRY', recommendedGateway: 'iyzico', successRateHint: 92.5 },
  '527627': { cardBrand: 'MASTERCARD', cardType: 'CREDIT',  bankName: 'Akbank',             bankCountry: 'Turkey',       bankCountryCode: 'TR', currency: 'TRY', recommendedGateway: 'iyzico', successRateHint: 91.8 },
  '450603': { cardBrand: 'VISA',       cardType: 'DEBIT',   bankName: 'İş Bankası',         bankCountry: 'Turkey',       bankCountryCode: 'TR', currency: 'TRY', recommendedGateway: 'iyzico', successRateHint: 90.5 },
  // مصر والعراق
  '404042': { cardBrand: 'MEEZA',      cardType: 'PREPAID', bankName: 'CIB Egypt',          bankCountry: 'Egypt',        bankCountryCode: 'EG', currency: 'EGP', recommendedGateway: 'stripe', successRateHint: 88.0 },
  '458456': { cardBrand: 'VISA',       cardType: 'CREDIT',  bankName: 'Commercial Bank IQ', bankCountry: 'Iraq',         bankCountryCode: 'IQ', currency: 'IQD', recommendedGateway: 'stripe', successRateHint: 85.0 },
};

// Detect brand من أول رقم
function detectBrand(bin: string): string {
  if (bin.startsWith('4'))                                          return 'VISA';
  if (/^5[1-5]/.test(bin) || /^2[2-7]/.test(bin))                 return 'MASTERCARD';
  if (/^3[47]/.test(bin))                                          return 'AMEX';
  if (/^(446404|588845|968208|455708|588849|604906)/.test(bin))    return 'MADA';
  if (/^(404042|507803)/.test(bin))                                 return 'MEEZA';
  if (/^(9792|375[0-9]|376[0-9])/.test(bin))                      return 'TROY';
  return 'OTHER';
}

// ─── POST /api/bin/lookup ─────────────────────────────────────
export const lookupBin = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id;
  const { bin } = req.body;
  if (!bin || bin.length < 6) {
    res.status(400).json({ success: false, error: 'BIN must be at least 6 digits' });
    return;
  }
  const cleanBin = String(bin).replace(/\D/g, '').slice(0, 6);
  try {
    // ١. ابحث في DB أولاً
    const dbRecord: any[] = await prisma.$queryRawUnsafe(
      `SELECT * FROM bin_records WHERE bin = $1`, cleanBin
    );

    let result: any;

    if (dbRecord.length) {
      result = dbRecord[0];
    } else {
      // ٢. ابحث في local database
      const local = BIN_DATABASE[cleanBin];
      if (local) {
        result = { bin: cleanBin, ...local };
      } else {
        // ٣. استنتج من أول رقم
        const brand = detectBrand(cleanBin);
        const isVisa = brand === 'VISA';
        const isMC   = brand === 'MASTERCARD';
        result = {
          bin: cleanBin,
          cardBrand: brand,
          cardType: 'UNKNOWN',
          bankName: null,
          bankCountry: null,
          bankCountryCode: null,
          currency: null,
          recommendedGateway: isVisa || isMC ? 'stripe' : null,
          successRateHint: isVisa ? 92.0 : isMC ? 91.0 : null,
        };
      }
    }

    // سجّل الـ lookup
    const lookupId = crypto.randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO bin_lookups (id, "merchantId", bin, "cardBrand", "cardType", "bankName", "bankCountry", "gatewayHint", "createdAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      lookupId, merchantId, cleanBin,
      result.cardBrand || null, result.cardType || null,
      result.bankName || null, result.bankCountry || null,
      result.recommendedGateway || null, new Date().toISOString()
    );

    // اجلب أفضل gateway من active gateways للمرتشنت
    let gatewayRecommendation: any = null;
    if (result.recommendedGateway) {
      const gw: any[] = await prisma.$queryRawUnsafe(
        `SELECT id, name, code, "successRate", "costPercent" FROM payment_gateways WHERE "merchantId" = $1 AND code = $2 AND status = 'ACTIVE' LIMIT 1`,
        merchantId, result.recommendedGateway
      );
      if (gw.length) gatewayRecommendation = gw[0];
    }

    res.json({
      success: true,
      data: {
        bin: cleanBin,
        cardBrand:    result.cardBrand    || 'UNKNOWN',
        cardType:     result.cardType     || 'UNKNOWN',
        bankName:     result.bankName     || null,
        bankCountry:  result.bankCountry  || null,
        bankCountryCode: result.bankCountryCode || null,
        currency:     result.currency     || null,
        prepaidFlag:  result.prepaidFlag  || false,
        commercialFlag: result.commercialFlag || false,
        recommendedGateway: result.recommendedGateway || null,
        successRateHint:    result.successRateHint    || null,
        gatewayDetails: gatewayRecommendation,
        source: dbRecord.length ? 'database' : BIN_DATABASE[cleanBin] ? 'local' : 'inferred',
      },
    });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: 'BIN lookup failed' });
    return;
  }
};

// ─── GET /api/bin/history ─────────────────────────────────────
export const getLookupHistory = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id;
  const limit = parseInt(req.query.limit as string) || 20;
  try {
    const lookups: any[] = await prisma.$queryRawUnsafe(
      `SELECT * FROM bin_lookups WHERE "merchantId" = $1 ORDER BY "createdAt" DESC LIMIT $2`,
      merchantId, limit
    );
    res.json({ success: true, data: { lookups } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch history' });
    return;
  }
};

// ─── GET /api/bin/stats ───────────────────────────────────────
export const getBinStats = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id;
  const days = parseInt(req.query.days as string) || 30;
  const since = new Date(Date.now() - days * 86400000).toISOString();
  try {
    const lookups: any[] = await prisma.$queryRawUnsafe(
      `SELECT * FROM bin_lookups WHERE "merchantId" = $1 AND "createdAt" >= $2`,
      merchantId, since
    );

    const total = lookups.length;
    const brandBreakdown: Record<string, number> = {};
    const typeBreakdown: Record<string, number>  = {};
    const countryBreakdown: Record<string, number> = {};
    const gatewayBreakdown: Record<string, number> = {};

    lookups.forEach((l: any) => {
      if (l.cardBrand)   brandBreakdown[l.cardBrand]     = (brandBreakdown[l.cardBrand]   || 0) + 1;
      if (l.cardType)    typeBreakdown[l.cardType]        = (typeBreakdown[l.cardType]     || 0) + 1;
      if (l.bankCountry) countryBreakdown[l.bankCountry]  = (countryBreakdown[l.bankCountry] || 0) + 1;
      if (l.gatewayHint) gatewayBreakdown[l.gatewayHint] = (gatewayBreakdown[l.gatewayHint] || 0) + 1;
    });

    res.json({
      success: true,
      data: {
        period: `${days}d`,
        total,
        brandBreakdown,
        typeBreakdown,
        countryBreakdown,
        gatewayBreakdown,
      },
    });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch stats' });
    return;
  }
};

// ─── POST /api/bin/records (admin: إضافة BIN يدوياً) ─────────
export const addBinRecord = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { bin, cardBrand, cardType, bankName, bankCountry, bankCountryCode, currency, recommendedGateway, successRateHint } = req.body;
  if (!bin || bin.length < 6) {
    res.status(400).json({ success: false, error: 'BIN must be at least 6 digits' });
    return;
  }
  const cleanBin = String(bin).replace(/\D/g, '').slice(0, 6);
  try {
    const recordId = crypto.randomUUID();
    const now = new Date().toISOString();
    await prisma.$executeRawUnsafe(
      `INSERT INTO bin_records (id, bin, "cardBrand", "cardType", "bankName", "bankCountry", "bankCountryCode", currency, "recommendedGateway", "successRateHint", "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (bin) DO UPDATE SET "cardBrand"=$3, "cardType"=$4, "bankName"=$5, "bankCountry"=$6, "bankCountryCode"=$7, currency=$8, "recommendedGateway"=$9, "successRateHint"=$10, "updatedAt"=$12`,
      recordId, cleanBin, cardBrand || 'OTHER', cardType || 'UNKNOWN',
      bankName || null, bankCountry || null, bankCountryCode || null,
      currency || null, recommendedGateway || null, successRateHint || null, now, now
    );
    const rows: any[] = await prisma.$queryRawUnsafe(`SELECT * FROM bin_records WHERE bin = $1`, cleanBin);
    res.status(201).json({ success: true, data: { record: rows[0] } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to add BIN record' });
    return;
  }
};
