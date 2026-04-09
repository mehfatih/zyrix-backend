// src/controllers/retryController.ts
import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { generateId } from "../lib/generateId";
import { emitEvent } from "./realtimeController";

const MAX_RETRIES = 3;

// Exponential backoff delays: attempt 1 → 1min, 2 → 5min, 3 → 15min
const BACKOFF_MINUTES = [1, 5, 15];

export const retryTransaction = async (req: Request, res: Response) => {
  const merchantId = (req as any).merchant?.id;
  const { transactionId } = req.params;

  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, merchantId },
    include: { retryLogs: { orderBy: { executedAt: "desc" } } },
  });

  if (!transaction) {
    return res.status(404).json({ error: "Transaction not found" });
  }

  if (transaction.status === "SUCCESS") {
    return res.status(400).json({ error: "Transaction already succeeded" });
  }

  if (transaction.retryCount >= MAX_RETRIES) {
    return res.status(400).json({
      error: "Max retry attempts reached",
      maxRetries: MAX_RETRIES,
      attempts: transaction.retryCount,
    });
  }

  const attemptNumber = transaction.retryCount + 1;
  const backoffMinutes = BACKOFF_MINUTES[transaction.retryCount] ?? 15;
  const nextRetryAt =
    attemptNumber < MAX_RETRIES
      ? new Date(Date.now() + backoffMinutes * 60 * 1000)
      : null;

  // Simulate retry — in production this calls the payment processor
  const isSuccess = Math.random() > 0.4; // 60% success rate simulation

  const retryStatus = isSuccess ? "SUCCESS" : attemptNumber >= MAX_RETRIES ? "EXHAUSTED" : "FAILED";
  const newTxStatus = isSuccess ? "SUCCESS" : "FAILED";

  const [retryLog, updatedTx] = await prisma.$transaction([
    prisma.retryLog.create({
      data: {
        transactionId: transaction.id,
        attemptNumber,
        status: retryStatus as any,
        errorMessage: isSuccess ? null : "Payment processor declined",
        errorCode: isSuccess ? null : "PROCESSOR_DECLINED",
        nextRetryAt,
      },
    }),
    prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        status: newTxStatus as any,
        retryCount: { increment: 1 },
        lastRetryAt: new Date(),
      },
    }),
  ]);

  // Emit SSE event
  await emitEvent(merchantId, "TRANSACTION_RETRY", {
    transactionId: transaction.transactionId,
    attempt: attemptNumber,
    status: retryStatus,
    amount: transaction.amount,
    currency: transaction.currency,
  });

  return res.json({
    success: true,
    attempt: attemptNumber,
    status: retryStatus,
    transactionStatus: newTxStatus,
    nextRetryAt,
    retryLog,
  });
};

export const getRetryLogs = async (req: Request, res: Response) => {
  const merchantId = (req as any).merchant?.id;
  const { transactionId } = req.params;

  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, merchantId },
  });

  if (!transaction) {
    return res.status(404).json({ error: "Transaction not found" });
  }

  const logs = await prisma.retryLog.findMany({
    where: { transactionId: transaction.id },
    orderBy: { executedAt: "asc" },
  });

  return res.json({ logs, retryCount: transaction.retryCount, maxRetries: MAX_RETRIES });
};

export const getFailedTransactions = async (req: Request, res: Response) => {
  const merchantId = (req as any).merchant?.id;
  const { page = "1", limit = "20" } = req.query;

  const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
  const take = parseInt(limit as string);

  const [transactions, total] = await prisma.$transaction([
    prisma.transaction.findMany({
      where: { merchantId, status: "FAILED" },
      include: {
        retryLogs: { orderBy: { executedAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.transaction.count({ where: { merchantId, status: "FAILED" } }),
  ]);

  const enriched = transactions.map((tx) => ({
    ...tx,
    canRetry: tx.retryCount < MAX_RETRIES,
    lastRetryStatus: tx.retryLogs[0]?.status ?? null,
  }));

  return res.json({ transactions: enriched, total, page: parseInt(page as string), limit: take });
};
