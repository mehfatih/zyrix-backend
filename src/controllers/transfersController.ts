// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Transfers Controller
// ─────────────────────────────────────────────────────────────
import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types";
import { transfersService } from "../services/transfersService";

export const transfersController = {
  async list(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const data = await transfersService.list(req.merchant.id);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { toMerchantId, amount, description } = req.body as {
        toMerchantId: string;
        amount: number;
        description?: string;
      };

      if (!toMerchantId || typeof toMerchantId !== "string") {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "toMerchantId is required" },
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

      const transfer = await transfersService.create(req.merchant.id, {
        toMerchantId,
        amount,
        description,
      });

      if (!transfer) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Recipient merchant not found" },
        });
        return;
      }

      res.status(201).json({ success: true, data: transfer });
    } catch (err) {
      next(err);
    }
  },
};
