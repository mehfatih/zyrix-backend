// ─────────────────────────────────────────────────────────────
// Zyrix Backend — COD Controller
// ─────────────────────────────────────────────────────────────
import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types";
import { codService } from "../services/codService";

export const codController = {
  async list(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const filters: { status?: string } = {};
      if (req.query.status && typeof req.query.status === "string") {
        filters.status = req.query.status.toUpperCase();
      }
      const data = await codService.list(req.merchant.id, filters);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { customerName, amount, currency, address, phone, description } = req.body as {
        customerName: string;
        amount: number;
        currency?: string;
        address: string;
        phone?: string;
        description?: string;
      };

      if (!customerName || typeof customerName !== "string") {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "customerName is required" },
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

      if (!address || typeof address !== "string") {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "address is required" },
        });
        return;
      }

      const order = await codService.create(req.merchant.id, {
        customerName,
        amount,
        currency: currency || "SAR",
        address,
        phone,
        description,
      });

      res.status(201).json({ success: true, data: order });
    } catch (err) {
      next(err);
    }
  },

  async markCollected(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { collectedAmount, notes } = req.body as {
        collectedAmount?: number;
        notes?: string;
      };

      const order = await codService.markCollected(
        req.merchant.id,
        req.params.id,
        { collectedAmount, notes }
      );

      if (!order) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "COD order not found" },
        });
        return;
      }

      res.json({ success: true, data: order });
    } catch (err) {
      next(err);
    }
  },

  async summary(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const data = await codService.summary(req.merchant.id);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },
};
