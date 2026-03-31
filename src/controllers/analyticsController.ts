// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Analytics Controller
// ─────────────────────────────────────────────────────────────

import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types";
import { analyticsService } from "../services/analyticsService";

const VALID_PERIODS = ["7d", "30d", "90d", "1y"];

export const analyticsController = {
  async getOverview(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const data = await analyticsService.getOverview(req.merchant.id);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  async getVolume(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const period = (req.query.period as string) || "7d";
      if (!VALID_PERIODS.includes(period)) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "period must be 7d, 30d, 90d, or 1y" },
        });
        return;
      }
      const data = await analyticsService.getVolume(req.merchant.id, period);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  async getMethods(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const data = await analyticsService.getMethods(req.merchant.id);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  async getCountries(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const data = await analyticsService.getCountries(req.merchant.id);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  async getTrends(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const data = await analyticsService.getTrends(req.merchant.id);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },
};
