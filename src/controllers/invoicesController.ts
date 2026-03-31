// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Invoices Controller
// ─────────────────────────────────────────────────────────────

import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types";
import { invoicesService } from "../services/invoicesService";
import { parsePagination, buildMeta } from "../utils/pagination";

export const invoicesController = {
  async list(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const pagination = parsePagination(req.query.page as string, req.query.limit as string);
      const { data, total } = await invoicesService.list(req.merchant.id, pagination);
      res.json({ success: true, data, meta: buildMeta(pagination.page, pagination.limit, total) });
    } catch (err) { next(err); }
  },

  async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { customerName, total, currency, items, dueDate } = req.body as {
        customerName: string; total: number; currency: string;
        items: unknown[]; dueDate: string;
      };
      if (!customerName || total === undefined || !currency || !items || !dueDate) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "customerName, total, currency, items, dueDate are required" },
        });
        return;
      }
      const inv = await invoicesService.create(req.merchant.id, { customerName, total, currency, items, dueDate });
      res.status(201).json({ success: true, data: inv });
    } catch (err) { next(err); }
  },

  async getById(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const inv = await invoicesService.getById(req.merchant.id, req.params.id);
      if (!inv) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Invoice not found" } });
        return;
      }
      res.json({ success: true, data: inv });
    } catch (err) { next(err); }
  },

  async update(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const updated = await invoicesService.update(req.merchant.id, req.params.id, req.body);
      if (!updated) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Invoice not found" } });
        return;
      }
      res.json({ success: true, data: updated });
    } catch (err) { next(err); }
  },

  async delete(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await invoicesService.delete(req.merchant.id, req.params.id);
      if (!result) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Invoice not found" } });
        return;
      }
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  },

  async send(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await invoicesService.send(req.merchant.id, req.params.id);
      if (!result) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Invoice not found" } });
        return;
      }
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  },
};
