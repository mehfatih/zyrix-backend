// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Settlements Controller
// ─────────────────────────────────────────────────────────────

import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types";
import { settlementsService } from "../services/settlementsService";
import { parsePagination, buildMeta } from "../utils/pagination";

export const settlementsController = {
  async list(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const pagination = parsePagination(
        req.query.page as string,
        req.query.limit as string
      );
      const filters: { status?: string; from?: Date; to?: Date } = {};
      if (req.query.status && typeof req.query.status === "string") {
        filters.status = req.query.status.toUpperCase();
      }
      if (req.query.from && typeof req.query.from === "string") {
        const d = new Date(req.query.from);
        if (!isNaN(d.getTime())) filters.from = d;
      }
      if (req.query.to && typeof req.query.to === "string") {
        const d = new Date(req.query.to);
        if (!isNaN(d.getTime())) { d.setHours(23, 59, 59, 999); filters.to = d; }
      }

      const { data, total } = await settlementsService.list(
        req.merchant.id, filters, pagination
      );
      res.json({
        success: true,
        data,
        meta: buildMeta(pagination.page, pagination.limit, total),
      });
    } catch (err) {
      next(err);
    }
  },

  async getById(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const s = await settlementsService.getById(req.merchant.id, req.params.id);
      if (!s) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Settlement not found" },
        });
        return;
      }
      res.json({ success: true, data: s });
    } catch (err) {
      next(err);
    }
  },

  async getUpcoming(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const data = await settlementsService.getUpcoming(req.merchant.id);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },
};
