// src/controllers/walletsController.ts (Elite)
// Sub-wallets + Segregation + Cashflow Alerts
import { Response } from "express";
import { prisma } from "../config/database";
import { AuthenticatedRequest } from "../types";

// ─── Types ───────────────────────────────────────────────────

interface SubWalletRow {
  id: string;
  wallet_id: string;
  name: string;
  purpose: string;
  balance: number;
  target_amount: number | null;
  color: string;
  icon: string;
  is_locked: boolean;
  created_at: string;
}

interface CashflowAlertRow {
  id: string;
  currency: string;
  threshold: number;
  alert_type: string;
  is_active: boolean;
  last_triggered_at: string | null;
}

// ─── Supported currencies ─────────────────────────────────────
const SUPPORTED = ["SAR", "AED", "TRY", "USD", "EUR", "KWD", "QAR", "IQD"];

const CURRENCY_META: Record<string, { flag: string; nameAr: string; symbol: string }> = {
  SAR: { flag: "🇸🇦", nameAr: "ريال سعودي",   symbol: "ر.س" },
  AED: { flag: "🇦🇪", nameAr: "درهم إماراتي", symbol: "د.إ" },
  TRY: { flag: "🇹🇷", nameAr: "ليرة تركية",   symbol: "₺"   },
  USD: { flag: "🇺🇸", nameAr: "دولار أمريكي", symbol: "$"   },
  EUR: { flag: "🇪🇺", nameAr: "يورو",          symbol: "€"   },
  KWD: { flag: "🇰🇼", nameAr: "دينار كويتي",  symbol: "د.ك" },
  QAR: { flag: "🇶🇦", nameAr: "ريال قطري",    symbol: "ر.ق" },
  IQD: { flag: "🇮🇶", nameAr: "دينار عراقي",  symbol: "ع.د" },
};

// ─── FX Rate ─────────────────────────────────────────────────
async function getRate(from: string, to: string): Promise<number> {
  if (from === to) return 1;
  const rate = await prisma.fxRate.findFirst({
    where: { fromCcy: from, toCcy: to },
    orderBy: { recordedAt: "desc" },
  });
  if (rate) return Number(rate.rate);
  const fallbacks: Record<string, number> = {
    "SAR_USD": 0.267, "SAR_AED": 0.98,  "SAR_TRY": 8.6,  "SAR_EUR": 0.245,
    "SAR_KWD": 0.082, "SAR_QAR": 0.972, "SAR_IQD": 348,
    "USD_SAR": 3.75,  "USD_AED": 3.67,  "USD_TRY": 32.2,  "USD_EUR": 0.92,
    "AED_SAR": 1.02,  "AED_USD": 0.272, "TRY_SAR": 0.116,
  };
  return fallbacks[`${from}_${to}`] || 1;
}

// ─── Seed wallets ─────────────────────────────────────────────
async function seedWallets(merchantId: string): Promise<void> {
  const existing = await prisma.wallet.findMany({ where: { merchantId }, select: { currency: true } });
  const existingSet = new Set(existing.map((w) => w.currency));
  const toCreate = SUPPORTED.filter((c) => !existingSet.has(c)).map((currency) => ({
    merchantId,
    currency,
    balance: currency === "SAR" ? 12500 : currency === "USD" ? 3200 : currency === "AED" ? 4800 : currency === "TRY" ? 28000 : 0,
    lockedBalance: 0,
    isActive: ["SAR", "USD", "AED"].includes(currency),
  }));
  if (toCreate.length > 0) {
    await prisma.wallet.createMany({ data: toCreate, skipDuplicates: true });
  }
}

// ─── Check cashflow alerts ────────────────────────────────────
async function checkCashflowAlerts(merchantId: string, currency: string, balance: number): Promise<void> {
  const alerts = await prisma.$queryRawUnsafe<CashflowAlertRow[]>(
    `SELECT id, currency, threshold, alert_type, is_active, last_triggered_at
     FROM wallet_cashflow_alerts
     WHERE merchant_id = $1 AND currency = $2 AND is_active = TRUE`,
    merchantId, currency
  );

  for (const alert of alerts) {
    if (alert.alert_type === "LOW_BALANCE" && balance < Number(alert.threshold)) {
      await prisma.$executeRawUnsafe(
        `UPDATE wallet_cashflow_alerts SET last_triggered_at = NOW() WHERE id = $1`,
        alert.id
      );
    }
  }
}

// ─── GET /api/wallets ─────────────────────────────────────────
export async function listWallets(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant.id;
    await seedWallets(merchantId);

    const wallets = await prisma.wallet.findMany({
      where: { merchantId },
      orderBy: [{ isActive: "desc" }, { balance: "desc" }],
    });

    let totalUSD = 0;
    const walletsWithMeta = await Promise.all(
      wallets.map(async (w) => {
        const rate = await getRate(w.currency, "USD");
        const usdValue = Number(w.balance) * rate;
        totalUSD += usdValue;

        // جلب sub-wallets
        const subWallets = await prisma.$queryRawUnsafe<SubWalletRow[]>(
          `SELECT id, name, purpose, balance, target_amount, color, icon, is_locked
           FROM sub_wallets WHERE wallet_id = $1 ORDER BY balance DESC`,
          w.id
        );

        return {
          ...w,
          balance:       Number(w.balance),
          lockedBalance: Number(w.lockedBalance),
          available:     Number(w.balance) - Number(w.lockedBalance),
          usdValue:      Math.round(usdValue * 100) / 100,
          meta:          CURRENCY_META[w.currency] || { flag: "💱", nameAr: w.currency, symbol: w.currency },
          subWallets:    subWallets.map((s: SubWalletRow) => ({
            id: s.id,
            name: s.name,
            purpose: s.purpose,
            balance: Number(s.balance),
            targetAmount: s.target_amount ? Number(s.target_amount) : null,
            color: s.color,
            icon: s.icon,
            isLocked: s.is_locked,
          })),
        };
      })
    );

    res.json({
      success: true,
      data: {
        wallets: walletsWithMeta,
        totalUSD: Math.round(totalUSD * 100) / 100,
        activeCount: wallets.filter((w) => w.isActive).length,
      },
    });
  } catch {
    res.status(500).json({ success: false, message: "Failed to load wallets" });
  }
}

// ─── GET /api/wallets/:currency ───────────────────────────────
export async function getWallet(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant.id;
    const { currency } = req.params;

    await seedWallets(merchantId);

    const wallet = await prisma.wallet.findFirst({
      where: { merchantId, currency: currency.toUpperCase() },
    });
    if (!wallet) {
      res.status(404).json({ success: false, message: "Wallet not found" });
      return;
    }

    const txs = await prisma.walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    const sparkline = txs.slice(0, 7).reverse().map((t) => Number(t.balanceAfter));

    const subWallets = await prisma.$queryRawUnsafe<SubWalletRow[]>(
      `SELECT id, name, purpose, balance, target_amount, color, icon, is_locked, created_at
       FROM sub_wallets WHERE wallet_id = $1 ORDER BY balance DESC`,
      wallet.id
    );

    const alerts = await prisma.$queryRawUnsafe<CashflowAlertRow[]>(
      `SELECT id, currency, threshold, alert_type, is_active, last_triggered_at
       FROM wallet_cashflow_alerts WHERE merchant_id = $1 AND currency = $2`,
      merchantId, currency.toUpperCase()
    );

    res.json({
      success: true,
      data: {
        wallet: {
          ...wallet,
          balance:       Number(wallet.balance),
          lockedBalance: Number(wallet.lockedBalance),
          available:     Number(wallet.balance) - Number(wallet.lockedBalance),
          meta:          CURRENCY_META[wallet.currency] || { flag: "💱", nameAr: wallet.currency, symbol: wallet.currency },
        },
        transactions: txs.map((t) => ({
          ...t,
          amount:        Number(t.amount),
          balanceBefore: Number(t.balanceBefore),
          balanceAfter:  Number(t.balanceAfter),
        })),
        sparkline,
        subWallets: subWallets.map((s: SubWalletRow) => ({
          id: s.id,
          name: s.name,
          purpose: s.purpose,
          balance: Number(s.balance),
          targetAmount: s.target_amount ? Number(s.target_amount) : null,
          color: s.color,
          icon: s.icon,
          isLocked: s.is_locked,
          createdAt: s.created_at,
        })),
        cashflowAlerts: alerts.map((a: CashflowAlertRow) => ({
          id: a.id,
          currency: a.currency,
          threshold: Number(a.threshold),
          alertType: a.alert_type,
          isActive: a.is_active,
          lastTriggeredAt: a.last_triggered_at,
        })),
      },
    });
  } catch {
    res.status(500).json({ success: false, message: "Failed to load wallet" });
  }
}

// ─── POST /api/wallets/convert ────────────────────────────────
export async function convertCurrency(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant.id;
    const { fromCurrency, toCurrency, amount } = req.body as {
      fromCurrency: string; toCurrency: string; amount: number;
    };

    if (!fromCurrency || !toCurrency || !amount || amount <= 0) {
      res.status(400).json({ success: false, message: "fromCurrency, toCurrency, amount required" });
      return;
    }
    if (fromCurrency === toCurrency) {
      res.status(400).json({ success: false, message: "Cannot convert to same currency" });
      return;
    }

    await seedWallets(merchantId);

    const fromWallet = await prisma.wallet.findFirst({ where: { merchantId, currency: fromCurrency.toUpperCase() } });
    const toWallet   = await prisma.wallet.findFirst({ where: { merchantId, currency: toCurrency.toUpperCase() } });

    if (!fromWallet || !toWallet) {
      res.status(404).json({ success: false, message: "Wallet not found" });
      return;
    }

    const available = Number(fromWallet.balance) - Number(fromWallet.lockedBalance);
    if (available < amount) {
      res.status(400).json({ success: false, message: `رصيد غير كافٍ. المتاح: ${available} ${fromCurrency}` });
      return;
    }

    const rate         = await getRate(fromCurrency.toUpperCase(), toCurrency.toUpperCase());
    const convertedAmt = Math.round(amount * rate * 100) / 100;
    const fee          = Math.round(amount * 0.005 * 100) / 100;
    const netConverted = Math.round((convertedAmt - convertedAmt * 0.005) * 100) / 100;

    const [updatedFrom, updatedTo] = await prisma.$transaction([
      prisma.wallet.update({ where: { id: fromWallet.id }, data: { balance: { decrement: amount }, updatedAt: new Date() } }),
      prisma.wallet.update({ where: { id: toWallet.id },   data: { balance: { increment: netConverted }, updatedAt: new Date() } }),
    ]);

    const ref = `CONV-${Date.now().toString(36).toUpperCase()}`;
    await prisma.walletTransaction.createMany({
      data: [
        { walletId: fromWallet.id, type: "DEBIT",  amount, balanceBefore: Number(fromWallet.balance), balanceAfter: Number(updatedFrom.balance), description: `تحويل إلى ${toCurrency}: ${netConverted}`, reference: ref },
        { walletId: toWallet.id,   type: "CREDIT", amount: netConverted, balanceBefore: Number(toWallet.balance), balanceAfter: Number(updatedTo.balance), description: `تحويل من ${fromCurrency}: ${amount}`, reference: ref },
      ],
    });

    // فحص تنبيهات الـ cashflow
    checkCashflowAlerts(merchantId, fromCurrency.toUpperCase(), Number(updatedFrom.balance)).catch(() => {});

    res.json({
      success: true,
      data: {
        from:      { currency: fromCurrency, amount, newBalance: Number(updatedFrom.balance) },
        to:        { currency: toCurrency, amount: netConverted, newBalance: Number(updatedTo.balance) },
        rate, fee,
        reference: ref,
      },
      message: `تم التحويل: ${amount} ${fromCurrency} → ${netConverted} ${toCurrency}`,
    });
  } catch {
    res.status(500).json({ success: false, message: "Conversion failed" });
  }
}

// ─── PATCH /api/wallets/:currency/toggle ─────────────────────
export async function toggleWallet(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant.id;
    const { currency } = req.params;

    const wallet = await prisma.wallet.findFirst({ where: { merchantId, currency: currency.toUpperCase() } });
    if (!wallet) {
      res.status(404).json({ success: false, message: "Wallet not found" });
      return;
    }

    const updated = await prisma.wallet.update({
      where: { id: wallet.id },
      data:  { isActive: !wallet.isActive, updatedAt: new Date() },
    });

    res.json({ success: true, data: { currency, isActive: updated.isActive } });
  } catch {
    res.status(500).json({ success: false, message: "Toggle failed" });
  }
}

// ─── GET /api/wallets/rates ───────────────────────────────────
export async function getWalletRates(_req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const pairs = ["SAR", "AED", "TRY", "USD", "EUR", "KWD", "QAR"];
    const rates: Record<string, number> = {};
    for (const ccy of pairs) {
      rates[`${ccy}_SAR`] = await getRate(ccy, "SAR");
      rates[`${ccy}_USD`] = await getRate(ccy, "USD");
    }
    res.json({ success: true, data: { rates, updatedAt: new Date().toISOString() } });
  } catch {
    res.status(500).json({ success: false, message: "Failed to load rates" });
  }
}

// ─── POST /api/wallets/:currency/sub-wallets (Elite) ─────────
export async function createSubWallet(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant.id;
    const { currency } = req.params;
    const { name, purpose = "general", targetAmount, color = "#6366F1", icon = "💼" } = req.body as {
      name: string; purpose?: string; targetAmount?: number; color?: string; icon?: string;
    };

    if (!name) {
      res.status(400).json({ success: false, message: "name is required" });
      return;
    }

    const wallet = await prisma.wallet.findFirst({ where: { merchantId, currency: currency.toUpperCase() } });
    if (!wallet) {
      res.status(404).json({ success: false, message: "Wallet not found" });
      return;
    }

    await prisma.$executeRawUnsafe(
      `INSERT INTO sub_wallets (merchant_id, wallet_id, name, purpose, balance, target_amount, color, icon)
       VALUES ($1, $2, $3, $4, 0, $5, $6, $7)`,
      merchantId, wallet.id, name, purpose,
      targetAmount ?? null,
      color, icon
    );

    const created = await prisma.$queryRawUnsafe<SubWalletRow[]>(
      `SELECT id, name, purpose, balance, target_amount, color, icon, is_locked, created_at
       FROM sub_wallets WHERE wallet_id = $1 ORDER BY created_at DESC LIMIT 1`,
      wallet.id
    );

    res.status(201).json({
      success: true,
      data: created[0]
        ? {
            id: created[0].id,
            name: created[0].name,
            purpose: created[0].purpose,
            balance: Number(created[0].balance),
            targetAmount: created[0].target_amount ? Number(created[0].target_amount) : null,
            color: created[0].color,
            icon: created[0].icon,
            isLocked: created[0].is_locked,
          }
        : null,
    });
  } catch {
    res.status(500).json({ success: false, message: "Failed to create sub-wallet" });
  }
}

// ─── POST /api/wallets/:currency/sub-wallets/:id/allocate (Elite) ─
export async function allocateToSubWallet(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant.id;
    const { currency, id: subWalletId } = req.params;
    const { amount } = req.body as { amount: number };

    if (!amount || amount <= 0) {
      res.status(400).json({ success: false, message: "amount must be positive" });
      return;
    }

    const wallet = await prisma.wallet.findFirst({ where: { merchantId, currency: currency.toUpperCase() } });
    if (!wallet) {
      res.status(404).json({ success: false, message: "Wallet not found" });
      return;
    }

    const available = Number(wallet.balance) - Number(wallet.lockedBalance);
    if (available < amount) {
      res.status(400).json({ success: false, message: `رصيد غير كافٍ. المتاح: ${available}` });
      return;
    }

    // نقل المبلغ للـ sub-wallet وتجميده في الـ main wallet
    await Promise.all([
      prisma.wallet.update({ where: { id: wallet.id }, data: { lockedBalance: { increment: amount } } }),
      prisma.$executeRawUnsafe(
        `UPDATE sub_wallets SET balance = balance + $1, updated_at = NOW() WHERE id = $2 AND merchant_id = $3`,
        amount, subWalletId, merchantId
      ),
    ]);

    const subRows = await prisma.$queryRawUnsafe<SubWalletRow[]>(
      `SELECT id, name, balance, target_amount FROM sub_wallets WHERE id = $1`,
      subWalletId
    );

    res.json({
      success: true,
      data: {
        subWalletId,
        allocated: amount,
        newSubBalance: subRows[0] ? Number(subRows[0].balance) : 0,
        targetAmount: subRows[0]?.target_amount ? Number(subRows[0].target_amount) : null,
      },
      message: `تم تخصيص ${amount} ${currency} للمحفظة الفرعية`,
    });
  } catch {
    res.status(500).json({ success: false, message: "Allocation failed" });
  }
}

// ─── DELETE /api/wallets/:currency/sub-wallets/:id (Elite) ───
export async function deleteSubWallet(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant.id;
    const { currency, id: subWalletId } = req.params;

    const wallet = await prisma.wallet.findFirst({ where: { merchantId, currency: currency.toUpperCase() } });
    if (!wallet) {
      res.status(404).json({ success: false, message: "Wallet not found" });
      return;
    }

    const subRows = await prisma.$queryRawUnsafe<SubWalletRow[]>(
      `SELECT balance FROM sub_wallets WHERE id = $1 AND merchant_id = $2`,
      subWalletId, merchantId
    );

    if (subRows.length === 0) {
      res.status(404).json({ success: false, message: "Sub-wallet not found" });
      return;
    }

    const subBalance = Number(subRows[0].balance);

    // إعادة المبلغ للـ main wallet
    await Promise.all([
      prisma.wallet.update({ where: { id: wallet.id }, data: { lockedBalance: { decrement: subBalance } } }),
      prisma.$executeRawUnsafe(
        `DELETE FROM sub_wallets WHERE id = $1 AND merchant_id = $2`,
        subWalletId, merchantId
      ),
    ]);

    res.json({ success: true, data: { deleted: true, returnedToMain: subBalance } });
  } catch {
    res.status(500).json({ success: false, message: "Failed to delete sub-wallet" });
  }
}

// ─── POST /api/wallets/cashflow-alerts (Elite) ───────────────
export async function setCashflowAlert(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant.id;
    const { currency, threshold, alertType = "LOW_BALANCE" } = req.body as {
      currency: string; threshold: number; alertType?: string;
    };

    if (!currency || threshold === undefined) {
      res.status(400).json({ success: false, message: "currency and threshold required" });
      return;
    }

    await prisma.$executeRawUnsafe(
      `INSERT INTO wallet_cashflow_alerts (merchant_id, currency, threshold, alert_type)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (merchant_id, currency, alert_type)
       DO UPDATE SET threshold = $3, is_active = TRUE, last_triggered_at = NULL`,
      merchantId, currency.toUpperCase(), threshold, alertType
    );

    res.json({
      success: true,
      data: { currency, threshold, alertType, message: `تم تفعيل تنبيه الـ cashflow عند ${threshold} ${currency}` },
    });
  } catch {
    res.status(500).json({ success: false, message: "Failed to set alert" });
  }
}

// ─── GET /api/wallets/cashflow-alerts (Elite) ────────────────
export async function getCashflowAlerts(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant.id;

    const alerts = await prisma.$queryRawUnsafe<CashflowAlertRow[]>(
      `SELECT id, currency, threshold, alert_type, is_active, last_triggered_at
       FROM wallet_cashflow_alerts WHERE merchant_id = $1 ORDER BY currency`,
      merchantId
    );

    // فحص الأرصدة الحالية مقابل الـ thresholds
    const triggered = [];
    for (const alert of alerts) {
      if (!alert.is_active) continue;
      const wallet = await prisma.wallet.findFirst({ where: { merchantId, currency: alert.currency } });
      if (wallet && Number(wallet.balance) < Number(alert.threshold)) {
        triggered.push({
          currency: alert.currency,
          currentBalance: Number(wallet.balance),
          threshold: Number(alert.threshold),
          alertType: alert.alert_type,
        });
      }
    }

    res.json({
      success: true,
      data: {
        alerts: alerts.map((a: CashflowAlertRow) => ({
          id: a.id,
          currency: a.currency,
          threshold: Number(a.threshold),
          alertType: a.alert_type,
          isActive: a.is_active,
          lastTriggeredAt: a.last_triggered_at,
        })),
        triggered,
      },
    });
  } catch {
    res.status(500).json({ success: false, message: "Failed to get alerts" });
  }
}
