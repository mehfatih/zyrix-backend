// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Dashboard Controller
// ─────────────────────────────────────────────────────────────

import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types";
import { dashboardService } from "../services/dashboardService";

export const dashboardController = {
  async getDashboard(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const data = await dashboardService.getDashboard(req.merchant.id);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  async getAnalytics(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const period = (req.query.period as string) || "7d";
      if (!["7d", "30d", "90d", "1y"].includes(period)) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "period must be 7d, 30d, 90d, or 1y" },
        });
        return;
      }
      const data = await dashboardService.getAnalytics(req.merchant.id, period);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },
};
