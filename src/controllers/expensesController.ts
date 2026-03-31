// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Expenses Controller
// ─────────────────────────────────────────────────────────────

import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types";
import { expensesService } from "../services/expensesService";
import { parsePagination, buildMeta } from "../utils/pagination";

export const expensesController = {
  async list(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const pagination = parsePagination(req.query.page as string, req.query.limit as string);
      const filters: { category?: string; from?: Date; to?: Date } = {};
      if (req.query.category && typeof req.query.category === "string") filters.category = req.query.category;
      if (req.query.from && typeof req.query.from === "string") {
        const d = new Date(req.query.from); if (!isNaN(d.getTime())) filters.from = d;
      }
      if (req.query.to && typeof req.query.to === "string") {
        const d = new Date(req.query.to); if (!isNaN(d.getTime())) { d.setHours(23,59,59,999); filters.to = d; }
      }
      const { data, total } = await expensesService.list(req.merchant.id, filters, pagination);
      res.json({ success: true, data, meta: buildMeta(pagination.page, pagination.limit, total) });
    } catch (err) { next(err); }
  },

  async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { category, description, amount, currency, date } = req.body as {
        category: string; description: string; amount: number; currency: string; date: string;
      };
      if (!category || !description || amount === undefined || !currency || !date) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "category, description, amount, currency, date are required" },
        });
        return;
      }
      const exp = await expensesService.create(req.merchant.id, { category, description, amount, currency, date });
      res.status(201).json({ success: true, data: exp });
    } catch (err) { next(err); }
  },

  async update(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const updated = await expensesService.update(req.merchant.id, req.params.id, req.body);
      if (!updated) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Expense not found" } });
        return;
      }
      res.json({ success: true, data: updated });
    } catch (err) { next(err); }
  },

  async delete(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await expensesService.delete(req.merchant.id, req.params.id);
      if (!result) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Expense not found" } });
        return;
      }
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  },

  async summary(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const data = await expensesService.summary(req.merchant.id);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  },
};
