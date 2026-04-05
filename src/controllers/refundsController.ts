// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Refunds Controller
// ─────────────────────────────────────────────────────────────
import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types";
import { refundsService } from "../services/refundsService";
import { parsePagination, buildMeta } from "../utils/pagination";

export const refundsController = {
  async list(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const pagination = parsePagination(
        req.query.page as string,
        req.query.limit as string
      );
      const filters: { status?: string } = {};
      if (req.query.status && typeof req.query.status === "string") {
        filters.status = req.query.status.toUpperCase();
      }
      const { data, total } = await refundsService.list(
        req.merchant.id, filters, pagination
      );
      res.json({
        success: true,
        data,
        meta: buildMeta(pagination.page, pagination.limit, total),
      });
    } catch (err) {
      next(err);
    }
  },

  async getById(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const refund = await refundsService.getById(req.merchant.id, req.params.id);
      if (!refund) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Refund not found" },
        });
        return;
      }
      res.json({ success: true, data: refund });
    } catch (err) {
      next(err);
    }
  },

  async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { transactionId, amount, reason } = req.body as {
        transactionId: string;
        amount: number;
        reason: string;
      };

      if (!transactionId || typeof transactionId !== "string") {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "transactionId is required" },
        });
        return;
      }
      if (!amount || typeof amount !== "number" || amount <= 0) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "amount must be a positive number" },
        });
        return;
      }
      if (!reason || typeof reason !== "string") {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "reason is required" },
        });
        return;
      }

      const refund = await refundsService.create(req.merchant.id, {
        transactionId,
        amount,
        reason,
      });

      if (!refund) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Transaction not found or not eligible for refund" },
        });
        return;
      }

      res.status(201).json({ success: true, data: refund });
    } catch (err) {
      next(err);
    }
  },
};
