// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Reconciliation Controller
// ─────────────────────────────────────────────────────────────
import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types";
import { prisma } from "../config/database";

function generateReportId(): string {
  return "REC-" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
}

export const reconciliationController = {
  async generateReconciliation(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const merchantId = req.merchant.id;
      const { periodStart, periodEnd, currency = "SAR" } = req.body;

      if (!periodStart || !periodEnd) {
        res.status(400).json({ success: false, error: { message: "periodStart and periodEnd are required" } });
        return;
      }

      const start = new Date(periodStart);
      const end = new Date(periodEnd);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        res.status(400).json({ success: false, error: { message: "Invalid date format" } });
        return;
      }

      const [transactions, refunds, settlements] = await prisma.$transaction([
        prisma.transaction.findMany({
          where: { merchantId, currency, createdAt: { gte: start, lte: end } },
          select: { status: true, amount: true },
        }),
        prisma.refund.findMany({
          where: { merchantId, currency, createdAt: { gte: start, lte: end }, status: "COMPLETED" },
          select: { amount: true },
        }),
        prisma.settlement.findMany({
          where: { merchantId, currency, createdAt: { gte: start, lte: end }, status: "COMPLETED" },
          select: { netAmount: true, commission: true },
        }),
      ]);

      const successTxs = transactions.filter((t) => t.status === "SUCCESS");
      const failedTxs = transactions.filter((t) => t.status === "FAILED");
      const pendingTxs = transactions.filter((t) => t.status === "PENDING");

      const grossVolume = successTxs.reduce((sum, t) => sum + Number(t.amount), 0);
      const totalRefunds = refunds.reduce((sum, r) => sum + Number(r.amount), 0);
      const totalSettlements = settlements.reduce((sum, s) => sum + Number(s.netAmount), 0);
      const totalFees = settlements.reduce((sum, s) => sum + Number(s.commission), 0);
      const netBalance = grossVolume - totalRefunds - totalFees;
      const discrepancyAmount = Math.abs(netBalance - totalSettlements);
      const status = discrepancyAmount < 0.01 ? "BALANCED" : "DISCREPANCY";

      const report = await prisma.reconciliationReport.create({
        data: {
          merchantId,
          reportId: generateReportId(),
          periodStart: start,
          periodEnd: end,
          totalTransactions: transactions.length,
          successCount: successTxs.length,
          failedCount: failedTxs.length,
          pendingCount: pendingTxs.length,
          grossVolume,
          totalRefunds,
          totalSettlements,
          totalFees,
          netBalance,
          discrepancyAmount,
          status: status as any,
          currency,
        },
      });

      res.status(201).json({ success: true, data: { report } });
    } catch (err) {
      next(err);
    }
  },

  async listReconciliations(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const merchantId = req.merchant.id;
      const page = parseInt((req.query.page as string) || "1");
      const limit = parseInt((req.query.limit as string) || "10");
      const skip = (page - 1) * limit;
      const status = req.query.status as string | undefined;

      const where: any = { merchantId };
      if (status) where.status = status;

      const [reports, total] = await prisma.$transaction([
        prisma.reconciliationReport.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
        }),
        prisma.reconciliationReport.count({ where }),
      ]);

      res.json({ success: true, data: { reports, total, page, limit } });
    } catch (err) {
      next(err);
    }
  },

  async getReconciliation(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const merchantId = req.merchant.id;
      const { reportId } = req.params;

      const report = await prisma.reconciliationReport.findFirst({
        where: { reportId, merchantId },
      });

      if (!report) {
        res.status(404).json({ success: false, error: { message: "Report not found" } });
        return;
      }

      res.json({ success: true, data: { report } });
    } catch (err) {
      next(err);
    }
  },
};
