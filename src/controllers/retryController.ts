// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Retry Controller
// ─────────────────────────────────────────────────────────────
import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types";
import { prisma } from "../config/database";

const MAX_RETRIES = 3;
const BACKOFF_MINUTES = [1, 5, 15];

export const retryController = {
  async retryTransaction(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const merchantId = req.merchant.id;
      const { transactionId } = req.params;

      const transaction = await prisma.transaction.findFirst({
        where: { id: transactionId, merchantId },
        include: { retryLogs: { orderBy: { executedAt: "desc" } } },
      });

      if (!transaction) {
        res.status(404).json({ success: false, error: { message: "Transaction not found" } });
        return;
      }

      if (transaction.status === "SUCCESS") {
        res.status(400).json({ success: false, error: { message: "Transaction already succeeded" } });
        return;
      }

      if (transaction.retryCount >= MAX_RETRIES) {
        res.status(400).json({
          success: false,
          error: { message: "Max retry attempts reached" },
          data: { maxRetries: MAX_RETRIES, attempts: transaction.retryCount },
        });
        return;
      }

      const attemptNumber = transaction.retryCount + 1;
      const backoffMinutes = BACKOFF_MINUTES[transaction.retryCount] ?? 15;
      const nextRetryAt =
        attemptNumber < MAX_RETRIES
          ? new Date(Date.now() + backoffMinutes * 60 * 1000)
          : null;

      const isSuccess = Math.random() > 0.4;
      const retryStatus = isSuccess ? "SUCCESS" : attemptNumber >= MAX_RETRIES ? "EXHAUSTED" : "FAILED";
      const newTxStatus = isSuccess ? "SUCCESS" : "FAILED";

      const [retryLog] = await prisma.$transaction([
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

      res.json({
        success: true,
        data: {
          attempt: attemptNumber,
          status: retryStatus,
          transactionStatus: newTxStatus,
          nextRetryAt,
          retryLog,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  async getRetryLogs(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const merchantId = req.merchant.id;
      const { transactionId } = req.params;

      const transaction = await prisma.transaction.findFirst({
        where: { id: transactionId, merchantId },
      });

      if (!transaction) {
        res.status(404).json({ success: false, error: { message: "Transaction not found" } });
        return;
      }

      const logs = await prisma.retryLog.findMany({
        where: { transactionId: transaction.id },
        orderBy: { executedAt: "asc" },
      });

      res.json({
        success: true,
        data: { logs, retryCount: transaction.retryCount, maxRetries: MAX_RETRIES },
      });
    } catch (err) {
      next(err);
    }
  },

  async getFailedTransactions(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const merchantId = req.merchant.id;
      const page = parseInt((req.query.page as string) || "1");
      const limit = parseInt((req.query.limit as string) || "20");
      const skip = (page - 1) * limit;

      const [transactions, total] = await prisma.$transaction([
        prisma.transaction.findMany({
          where: { merchantId, status: "FAILED" },
          include: {
            retryLogs: { orderBy: { executedAt: "desc" }, take: 1 },
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
        }),
        prisma.transaction.count({ where: { merchantId, status: "FAILED" } }),
      ]);

      const enriched = transactions.map((tx) => ({
        ...tx,
        canRetry: tx.retryCount < MAX_RETRIES,
        lastRetryStatus: tx.retryLogs[0]?.status ?? null,
      }));

      res.json({ success: true, data: { transactions: enriched, total, page, limit } });
    } catch (err) {
      next(err);
    }
  },
};
