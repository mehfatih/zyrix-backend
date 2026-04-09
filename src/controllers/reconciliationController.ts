// src/controllers/reconciliationController.ts
import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { generateId } from "../lib/generateId";

export const generateReconciliation = async (req: Request, res: Response) => {
  const merchantId = (req as any).merchant?.id;
  const { periodStart, periodEnd, currency = "SAR" } = req.body;

  if (!periodStart || !periodEnd) {
    return res.status(400).json({ error: "periodStart and periodEnd are required" });
  }

  const start = new Date(periodStart);
  const end = new Date(periodEnd);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return res.status(400).json({ error: "Invalid date format" });
  }

  // Aggregate transactions
  const [transactions, refunds, settlements] = await prisma.$transaction([
    prisma.transaction.findMany({
      where: {
        merchantId,
        currency,
        createdAt: { gte: start, lte: end },
      },
      select: { status: true, amount: true },
    }),
    prisma.refund.findMany({
      where: {
        merchantId,
        currency,
        createdAt: { gte: start, lte: end },
        status: "COMPLETED",
      },
      select: { amount: true },
    }),
    prisma.settlement.findMany({
      where: {
        merchantId,
        currency,
        createdAt: { gte: start, lte: end },
        status: "COMPLETED",
      },
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

  // Discrepancy = net balance - total settled
  const discrepancyAmount = Math.abs(netBalance - totalSettlements);
  const status = discrepancyAmount < 0.01 ? "BALANCED" : "DISCREPANCY";

  const report = await prisma.reconciliationReport.create({
    data: {
      merchantId,
      reportId: `REC-${generateId()}`,
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

  return res.status(201).json({ report });
};

export const listReconciliations = async (req: Request, res: Response) => {
  const merchantId = (req as any).merchant?.id;
  const { page = "1", limit = "10", status } = req.query;

  const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
  const take = parseInt(limit as string);

  const where: any = { merchantId };
  if (status) where.status = status;

  const [reports, total] = await prisma.$transaction([
    prisma.reconciliationReport.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.reconciliationReport.count({ where }),
  ]);

  return res.json({ reports, total, page: parseInt(page as string), limit: take });
};

export const getReconciliation = async (req: Request, res: Response) => {
  const merchantId = (req as any).merchant?.id;
  const { reportId } = req.params;

  const report = await prisma.reconciliationReport.findFirst({
    where: { reportId, merchantId },
  });

  if (!report) return res.status(404).json({ error: "Report not found" });

  return res.json({ report });
};
