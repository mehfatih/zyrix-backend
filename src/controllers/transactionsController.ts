// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Transactions Controller
// ─────────────────────────────────────────────────────────────

import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types";
import { transactionsService } from "../services/transactionsService";
import { parsePagination, buildMeta } from "../utils/pagination";
import { parseTransactionFilters } from "../utils/filters";

export const transactionsController = {
  async list(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const pagination = parsePagination(
        req.query.page as string,
        req.query.limit as string
      );
      const filters = parseTransactionFilters(req.query as Record<string, unknown>);
      const { data, total } = await transactionsService.list(
        req.merchant.id,
        filters,
        pagination
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
      const tx = await transactionsService.getById(req.merchant.id, req.params.id);
      if (!tx) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Transaction not found" },
        });
        return;
      }
      res.json({ success: true, data: tx });
    } catch (err) {
      next(err);
    }
  },

  async getStats(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const data = await transactionsService.getStats(req.merchant.id);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  async exportCsv(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const filters = parseTransactionFilters(req.query as Record<string, unknown>);
      const csv = await transactionsService.exportCsv(req.merchant.id, filters);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="transactions-${Date.now()}.csv"`
      );
      res.send(csv);
    } catch (err) {
      next(err);
    }
  },
};
