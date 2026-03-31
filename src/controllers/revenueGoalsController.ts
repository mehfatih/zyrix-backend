// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Revenue Goals Controller
// ─────────────────────────────────────────────────────────────

import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types";
import { revenueGoalsService } from "../services/revenueGoalsService";
import { parsePagination, buildMeta } from "../utils/pagination";

const VALID_PERIODS = ["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"];

export const revenueGoalsController = {
  async list(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const pagination = parsePagination(req.query.page as string, req.query.limit as string);
      const { data, total } = await revenueGoalsService.list(req.merchant.id, pagination);
      res.json({ success: true, data, meta: buildMeta(pagination.page, pagination.limit, total) });
    } catch (err) { next(err); }
  },

  async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { name, targetAmount, currency, period, startDate, endDate } = req.body as {
        name: string; targetAmount: number; currency: string;
        period: string; startDate: string; endDate: string;
      };
      if (!name || targetAmount === undefined || !currency || !period || !startDate || !endDate) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "name, targetAmount, currency, period, startDate, endDate are required" },
        });
        return;
      }
      if (!VALID_PERIODS.includes(period.toUpperCase())) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: `period must be one of: ${VALID_PERIODS.join(", ")}` },
        });
        return;
      }
      const goal = await revenueGoalsService.create(req.merchant.id, { name, targetAmount, currency, period, startDate, endDate });
      res.status(201).json({ success: true, data: goal });
    } catch (err) { next(err); }
  },

  async update(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const updated = await revenueGoalsService.update(req.merchant.id, req.params.id, req.body);
      if (!updated) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Revenue goal not found" } });
        return;
      }
      res.json({ success: true, data: updated });
    } catch (err) { next(err); }
  },

  async delete(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await revenueGoalsService.delete(req.merchant.id, req.params.id);
      if (!result) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Revenue goal not found" } });
        return;
      }
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  },
};
