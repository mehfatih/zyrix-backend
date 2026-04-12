// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Merchant Controller
// ─────────────────────────────────────────────────────────────
import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types";
import { merchantService } from "../services/merchantService";
import { Language, Currency } from "@prisma/client";
import { z } from "zod";
import prisma from "../lib/prisma";

// ── Validation Schemas ────────────────────────────────────────
const updateProfileSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  email: z.string().email().optional(),
  businessName: z.string().max(200).optional(),
  businessType: z.string().max(100).optional(),
});
const languageSchema = z.object({ language: z.enum(["AR", "EN", "TR"]) });
const currencySchema = z.object({
  currency: z.enum(["SAR", "AED", "KWD", "QAR", "IQD", "USD", "EUR", "TRY"]),
});

export const merchantController = {
  // ── Profile ────────────────────────────────────────────────
  async getProfile(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const merchant = await merchantService.getProfile(req.merchant.id);
      if (!merchant) {
        res.status(404).json({ success: false, error: { code: "MERCHANT_NOT_FOUND", message: "Merchant not found" } });
        return;
      }
      res.json({ success: true, data: merchant });
    } catch (err) { next(err); }
  },

  async updateProfile(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const body = updateProfileSchema.parse(req.body);
      const merchant = await merchantService.updateProfile(req.merchant.id, body);
      res.json({ success: true, data: merchant });
    } catch (err) { next(err); }
  },

  async updateLanguage(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { language } = languageSchema.parse(req.body);
      const result = await merchantService.updateLanguage(req.merchant.id, language as Language);
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  },

  async updateCurrency(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { currency } = currencySchema.parse(req.body);
      const result = await merchantService.updateCurrency(req.merchant.id, currency as Currency);
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  },

  async completeOnboarding(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await merchantService.completeOnboarding(req.merchant.id);
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  },

  async deleteAccount(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      await merchantService.deleteAccount(req.merchant.id);
      res.json({ success: true, data: { message: "Account deleted successfully" } });
    } catch (err) { next(err); }
  },

  // ── Stats (Dashboard KPIs) ────────────────────────────────
  async getStats(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const merchantId = req.merchant.id;
      const now = new Date();
      const start30 = new Date(now); start30.setDate(now.getDate() - 30);
      const start60 = new Date(now); start60.setDate(now.getDate() - 60);
      const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);

      // Current 30d transactions
      const txCurrent = await prisma.transaction.findMany({
        where: { merchantId, createdAt: { gte: start30 } },
        select: { amount: true, status: true, createdAt: true },
      });

      // Previous 30d transactions (for % change)
      const txPrev = await prisma.transaction.findMany({
        where: { merchantId, createdAt: { gte: start60, lt: start30 } },
        select: { amount: true, status: true },
      });

      // Today transactions
      const txToday = await prisma.transaction.findMany({
        where: { merchantId, createdAt: { gte: todayStart } },
        select: { amount: true, status: true },
      });

      // Open disputes
      const openDisputes = await prisma.dispute.findMany({
        where: { merchantId, status: { in: ["OPEN", "UNDER_REVIEW"] } },
        select: { amount: true },
      });

      // Helpers
      const sumSuccess = (arr: { amount: any; status: string }[]) =>
        arr.filter(t => t.status === "SUCCESS").reduce((s, t) => s + Number(t.amount), 0);

      const volumeCurrent = sumSuccess(txCurrent);
      const volumePrev    = sumSuccess(txPrev);
      const volumeChange  = volumePrev > 0
        ? (((volumeCurrent - volumePrev) / volumePrev) * 100).toFixed(1)
        : null;

      const successCount  = txCurrent.filter(t => t.status === "SUCCESS").length;
      const totalCount    = txCurrent.length;
      const successRate   = totalCount > 0 ? ((successCount / totalCount) * 100).toFixed(1) : "0.0";

      const todayCount    = txToday.length;
      const disputeAmount = openDisputes.reduce((s, d) => s + Number(d.amount), 0);

      // Daily volume chart (last 7 days)
      const dailyChart: Record<string, number> = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        dailyChart[d.toISOString().slice(0, 10)] = 0;
      }
      txCurrent.forEach(t => {
        const day = t.createdAt.toISOString().slice(0, 10);
        if (day in dailyChart && t.status === "SUCCESS") {
          dailyChart[day] += Number(t.amount);
        }
      });

      res.json({
        success: true,
        data: {
          volume: {
            value: volumeCurrent,
            change: volumeChange,
            currency: req.merchant.currency ?? "SAR",
          },
          successRate: {
            value: parseFloat(successRate),
            totalCount,
            successCount,
          },
          transactionsToday: {
            value: todayCount,
          },
          openDisputes: {
            count: openDisputes.length,
            amount: disputeAmount,
            currency: req.merchant.currency ?? "SAR",
          },
          dailyChart: Object.entries(dailyChart).map(([date, amount]) => ({ date, amount })),
        },
      });
    } catch (err) { next(err); }
  },

  // ── Transactions List ─────────────────────────────────────
  async getTransactions(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const merchantId = req.merchant.id;
      const page    = Math.max(1, parseInt(String(req.query.page  ?? "1")));
      const limit   = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "20"))));
      const skip    = (page - 1) * limit;
      const search  = String(req.query.search  ?? "").trim();
      const status  = String(req.query.status  ?? "").trim();
      const method  = String(req.query.method  ?? "").trim();
      const days    = parseInt(String(req.query.days ?? "30"));

      const since = new Date();
      since.setDate(since.getDate() - (isNaN(days) ? 30 : days));

      const where: any = {
        merchantId,
        createdAt: { gte: since },
      };

      if (search) {
        where.OR = [
          { transactionId: { contains: search, mode: "insensitive" } },
          { customerName:  { contains: search, mode: "insensitive" } },
          { customerEmail: { contains: search, mode: "insensitive" } },
        ];
      }
      if (status && status !== "all") {
        where.status = status.toUpperCase();
      }
      if (method && method !== "all") {
        where.method = method.toUpperCase();
      }

      const [transactions, total] = await Promise.all([
        prisma.transaction.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
          select: {
            id: true,
            transactionId: true,
            amount: true,
            currency: true,
            status: true,
            method: true,
            customerName: true,
            customerEmail: true,
            customerPhone: true,
            country: true,
            flag: true,
            isCredit: true,
            description: true,
            createdAt: true,
          },
        }),
        prisma.transaction.count({ where }),
      ]);

      // Stats for the same period
      const allPeriod = await prisma.transaction.findMany({
        where: { merchantId, createdAt: { gte: since } },
        select: { amount: true, status: true },
      });
      const totalVolume  = allPeriod.filter(t => t.status === "SUCCESS").reduce((s, t) => s + Number(t.amount), 0);
      const successCount = allPeriod.filter(t => t.status === "SUCCESS").length;
      const totalTx      = allPeriod.length;

      res.json({
        success: true,
        data: {
          transactions: transactions.map(t => ({
            ...t,
            amount: Number(t.amount),
          })),
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit),
          },
          stats: {
            totalVolume,
            totalTransactions: totalTx,
            successCount,
            successRate: totalTx > 0 ? parseFloat(((successCount / totalTx) * 100).toFixed(1)) : 0,
            currency: req.merchant.currency ?? "SAR",
          },
        },
      });
    } catch (err) { next(err); }
  },

  // ── Settlements List ──────────────────────────────────────
  async getSettlements(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const merchantId = req.merchant.id;
      const page  = Math.max(1, parseInt(String(req.query.page  ?? "1")));
      const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "20"))));
      const skip  = (page - 1) * limit;

      const [settlements, total] = await Promise.all([
        prisma.settlement.findMany({
          where: { merchantId },
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
        }),
        prisma.settlement.count({ where: { merchantId } }),
      ]);

      // Next pending settlement
      const nextSettlement = await prisma.settlement.findFirst({
        where: { merchantId, status: { in: ["SCHEDULED", "PROCESSING"] } },
        orderBy: { scheduledDate: "asc" },
      });

      res.json({
        success: true,
        data: {
          settlements: settlements.map(s => ({
            ...s,
            amount:    Number(s.amount),
            commission: Number(s.commission),
            netAmount:  Number(s.netAmount),
          })),
          pagination: { page, limit, total, pages: Math.ceil(total / limit) },
          nextSettlement: nextSettlement
            ? {
                ...nextSettlement,
                amount:    Number(nextSettlement.amount),
                commission: Number(nextSettlement.commission),
                netAmount:  Number(nextSettlement.netAmount),
              }
            : null,
        },
      });
    } catch (err) { next(err); }
  },

  // ── Balance (Wallets) ─────────────────────────────────────
  async getBalance(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const merchantId = req.merchant.id;

      const wallets = await prisma.wallet.findMany({
        where: { merchantId },
        orderBy: { currency: "asc" },
        select: {
          id: true,
          currency: true,
          balance: true,
          lockedBalance: true,
          isActive: true,
          updatedAt: true,
        },
      });

      const mainCurrency = req.merchant.currency ?? "SAR";
      const mainWallet   = wallets.find(w => w.currency === mainCurrency);

      res.json({
        success: true,
        data: {
          wallets: wallets.map(w => ({
            ...w,
            balance:       Number(w.balance),
            lockedBalance: Number(w.lockedBalance),
            available:     Number(w.balance) - Number(w.lockedBalance),
          })),
          main: mainWallet
            ? {
                currency:      mainWallet.currency,
                balance:       Number(mainWallet.balance),
                lockedBalance: Number(mainWallet.lockedBalance),
                available:     Number(mainWallet.balance) - Number(mainWallet.lockedBalance),
              }
            : null,
        },
      });
    } catch (err) { next(err); }
  },

  // ── Payment Links List ────────────────────────────────────
  async getPaymentLinks(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const merchantId = req.merchant.id;
      const page   = Math.max(1, parseInt(String(req.query.page  ?? "1")));
      const limit  = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "20"))));
      const skip   = (page - 1) * limit;
      const status = String(req.query.status ?? "").trim();

      const where: any = { merchantId };
      if (status && status !== "all") where.status = status.toUpperCase();

      const [links, total] = await Promise.all([
        prisma.paymentLink.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
          include: {
            payments: {
              select: { amount: true, status: true },
            },
          },
        }),
        prisma.paymentLink.count({ where }),
      ]);

      res.json({
        success: true,
        data: {
          links: links.map(l => ({
            ...l,
            amount:    l.amount    ? Number(l.amount)    : null,
            minAmount: l.minAmount ? Number(l.minAmount) : null,
            maxAmount: l.maxAmount ? Number(l.maxAmount) : null,
            totalCollected: l.payments
              .filter(p => p.status === "COMPLETED")
              .reduce((s, p) => s + Number(p.amount), 0),
          })),
          pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        },
      });
    } catch (err) { next(err); }
  },
};
