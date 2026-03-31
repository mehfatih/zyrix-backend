// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Subscriptions Controller
// ─────────────────────────────────────────────────────────────

import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types";
import { subscriptionsService } from "../services/subscriptionsService";
import { parsePagination, buildMeta } from "../utils/pagination";

export const subscriptionsController = {
  async list(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const pagination = parsePagination(req.query.page as string, req.query.limit as string);
      const { data, total } = await subscriptionsService.list(req.merchant.id, pagination);
      res.json({ success: true, data, meta: buildMeta(pagination.page, pagination.limit, total) });
    } catch (err) { next(err); }
  },

  async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { planName, amount, currency, interval, currentPeriodStart, currentPeriodEnd } = req.body as {
        planName: string; amount: number; currency: string;
        interval: string; currentPeriodStart: string; currentPeriodEnd: string;
      };
      if (!planName || amount === undefined || !currency || !interval || !currentPeriodStart || !currentPeriodEnd) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "planName, amount, currency, interval, currentPeriodStart, currentPeriodEnd are required" },
        });
        return;
      }
      if (!["MONTHLY", "YEARLY"].includes(interval.toUpperCase())) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "interval must be MONTHLY or YEARLY" },
        });
        return;
      }
      const sub = await subscriptionsService.create(req.merchant.id, { planName, amount, currency, interval, currentPeriodStart, currentPeriodEnd });
      res.status(201).json({ success: true, data: sub });
    } catch (err) { next(err); }
  },

  async update(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const updated = await subscriptionsService.update(req.merchant.id, req.params.id, req.body);
      if (!updated) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Subscription not found" } });
        return;
      }
      res.json({ success: true, data: updated });
    } catch (err) { next(err); }
  },

  async cancel(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await subscriptionsService.cancel(req.merchant.id, req.params.id);
      if (!result) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Subscription not found" } });
        return;
      }
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  },
};
