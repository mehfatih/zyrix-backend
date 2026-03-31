// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Payment Links Controller
// ─────────────────────────────────────────────────────────────

import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types";
import { paymentLinksService } from "../services/paymentLinksService";
import { parsePagination, buildMeta } from "../utils/pagination";

export const paymentLinksController = {
  async list(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const pagination = parsePagination(req.query.page as string, req.query.limit as string);
      const { data, total } = await paymentLinksService.list(req.merchant.id, pagination);
      res.json({ success: true, data, meta: buildMeta(pagination.page, pagination.limit, total) });
    } catch (err) { next(err); }
  },

  async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { title, amount, currency, expiresAt } = req.body as {
        title: string; amount: number; currency: string; expiresAt?: string;
      };
      if (!title || amount === undefined || !currency) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "title, amount, currency are required" },
        });
        return;
      }
      const link = await paymentLinksService.create(req.merchant.id, { title, amount, currency, expiresAt });
      res.status(201).json({ success: true, data: link });
    } catch (err) { next(err); }
  },

  async update(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const updated = await paymentLinksService.update(req.merchant.id, req.params.id, req.body);
      if (!updated) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Payment link not found" } });
        return;
      }
      res.json({ success: true, data: updated });
    } catch (err) { next(err); }
  },

  async delete(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await paymentLinksService.delete(req.merchant.id, req.params.id);
      if (!result) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Payment link not found" } });
        return;
      }
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  },
};
