// src/controllers/walletsController.ts
import { Response } from "express";
import { prisma } from "../config/database";
import { AuthenticatedRequest } from "../types";

// ─── Supported currencies ─────────────────────────────────────
const SUPPORTED = ["SAR", "AED", "TRY", "USD", "EUR", "KWD", "QAR", "IQD"];

const CURRENCY_META: Record<string, { flag: string; nameAr: string; symbol: string }> = {
  SAR: { flag: "🇸🇦", nameAr: "ريال سعودي",    symbol: "ر.س"  },
  AED: { flag: "🇦🇪", nameAr: "درهم إماراتي",  symbol: "د.إ"  },
  TRY: { flag: "🇹🇷", nameAr: "ليرة تركية",    symbol: "₺"    },
  USD: { flag: "🇺🇸", nameAr: "دولار أمريكي",  symbol: "$"    },
  EUR: { flag: "🇪🇺", nameAr: "يورو",           symbol: "€"    },
  KWD: { flag: "🇰🇼", nameAr: "دينار كويتي",   symbol: "د.ك"  },
  QAR: { flag: "🇶🇦", nameAr: "ريال قطري",     symbol: "ر.ق"  },
  IQD: { flag: "🇮🇶", nameAr: "دينار عراقي",   symbol: "ع.د"  },
};

// ─── Get live FX rate (latest from DB or fallback) ────────────
async function getRate(from: string, to: string): Promise<number> {
  if (from === to) return 1;
  const rate = await prisma.fxRate.findFirst({
    where: { fromCcy: from, toCcy: to },
    orderBy: { recordedAt: "desc" },
  });
  if (rate) return Number(rate.rate);
  // Static fallbacks (approximate)
  const fallbacks: Record<string, number> = {
    "SAR_USD": 0.267, "SAR_AED": 0.98,  "SAR_TRY": 8.6,  "SAR_EUR": 0.245,
    "SAR_KWD": 0.082, "SAR_QAR": 0.972, "SAR_IQD": 348,
    "USD_SAR": 3.75,  "USD_AED": 3.67,  "USD_TRY": 32.2, "USD_EUR": 0.92,
    "AED_SAR": 1.02,  "AED_USD": 0.272, "TRY_SAR": 0.116,
  };
  return fallbacks[`${from}_${to}`] || 1;
}

// ─── Seed default wallets for new merchant ────────────────────
async function seedWallets(merchantId: string): Promise<void> {
  const existing = await prisma.wallet.findMany({ where: { merchantId }, select: { currency: true } });
  const existingSet = new Set(existing.map(w => w.currency));
  const toCreate = SUPPORTED.filter(c => !existingSet.has(c)).map(currency => ({
    merchantId,
    currency,
    balance: currency === "SAR" ? 12500.00 : currency === "USD" ? 3200.00 : currency === "AED" ? 4800.00 : currency === "TRY" ? 28000.00 : 0,
    lockedBalance: 0,
    isActive: ["SAR", "USD", "AED"].includes(currency),
  }));
  if (toCreate.length > 0) {
    await prisma.wallet.createMany({ data: toCreate, skipDuplicates: true });
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

    // Convert each to USD for total
    let totalUSD = 0;
    const walletsWithMeta = await Promise.all(wallets.map(async w => {
      const rate = await getRate(w.currency, "USD");
      const usdValue = Number(w.balance) * rate;
      totalUSD += usdValue;
      return {
        ...w,
        balance:       Number(w.balance),
        lockedBalance: Number(w.lockedBalance),
        available:     Number(w.balance) - Number(w.lockedBalance),
        usdValue:      Math.round(usdValue * 100) / 100,
        meta:          CURRENCY_META[w.currency] || { flag: "💱", nameAr: w.currency, symbol: w.currency },
      };
    }));

    res.json({
      success: true,
      data: {
        wallets: walletsWithMeta,
        totalUSD: Math.round(totalUSD * 100) / 100,
        activeCount: wallets.filter(w => w.isActive).length,
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

    const wallet = await prisma.wallet.findFirst({ where: { merchantId, currency: currency.toUpperCase() } });
    if (!wallet) {
      res.status(404).json({ success: false, message: "Wallet not found" });
      return;
    }

    const txs = await prisma.walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    // Sparkline: last 7 days balance change
    const sparkline = txs.slice(0, 7).reverse().map(t => Number(t.balanceAfter));

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
        transactions: txs.map(t => ({ ...t, amount: Number(t.amount), balanceBefore: Number(t.balanceBefore), balanceAfter: Number(t.balanceAfter) })),
        sparkline,
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
    const { fromCurrency, toCurrency, amount } = req.body as { fromCurrency: string; toCurrency: string; amount: number };

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
    const fee          = Math.round(amount * 0.005 * 100) / 100; // 0.5% fee
    const netConverted = Math.round((convertedAmt - convertedAmt * 0.005) * 100) / 100;

    // Execute conversion
    const [updatedFrom, updatedTo] = await prisma.$transaction([
      prisma.wallet.update({
        where: { id: fromWallet.id },
        data:  { balance: { decrement: amount }, updatedAt: new Date() },
      }),
      prisma.wallet.update({
        where: { id: toWallet.id },
        data:  { balance: { increment: netConverted }, updatedAt: new Date() },
      }),
    ]);

    // Log transactions
    const ref = `CONV-${Date.now().toString(36).toUpperCase()}`;
    await prisma.walletTransaction.createMany({
      data: [
        {
          walletId:      fromWallet.id,
          type:          "DEBIT",
          amount:        amount,
          balanceBefore: Number(fromWallet.balance),
          balanceAfter:  Number(updatedFrom.balance),
          description:   `تحويل إلى ${toCurrency}: ${netConverted}`,
          reference:     ref,
        },
        {
          walletId:      toWallet.id,
          type:          "CREDIT",
          amount:        netConverted,
          balanceBefore: Number(toWallet.balance),
          balanceAfter:  Number(updatedTo.balance),
          description:   `تحويل من ${fromCurrency}: ${amount}`,
          reference:     ref,
        },
      ],
    });

    res.json({
      success: true,
      data: {
        from:          { currency: fromCurrency, amount, newBalance: Number(updatedFrom.balance) },
        to:            { currency: toCurrency, amount: netConverted, newBalance: Number(updatedTo.balance) },
        rate,
        fee,
        reference:     ref,
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
