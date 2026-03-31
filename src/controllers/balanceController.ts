// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Balance Controller
// ─────────────────────────────────────────────────────────────

import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types";
import { balanceService } from "../services/balanceService";

export const balanceController = {
  async getBalance(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const data = await balanceService.getBalance(req.merchant.id);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  async getHistory(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const period = (req.query.period as string) || "30d";
      if (!["7d", "30d", "90d"].includes(period)) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "period must be 7d, 30d, or 90d" },
        });
        return;
      }
      const data = await balanceService.getHistory(req.merchant.id, period);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },
};
