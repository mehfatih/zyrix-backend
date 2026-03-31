// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Disputes Controller
// ─────────────────────────────────────────────────────────────

import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types";
import { disputesService } from "../services/disputesService";
import { parsePagination, buildMeta } from "../utils/pagination";

export const disputesController = {
  async list(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const pagination = parsePagination(
        req.query.page as string,
        req.query.limit as string
      );
      const filters: { status?: string } = {};
      if (req.query.status && typeof req.query.status === "string") {
        filters.status = req.query.status.toUpperCase();
      }

      const { data, total } = await disputesService.list(
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
      const d = await disputesService.getById(req.merchant.id, req.params.id);
      if (!d) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Dispute not found" },
        });
        return;
      }
      res.json({ success: true, data: d });
    } catch (err) {
      next(err);
    }
  },

  async respond(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { response, evidence } = req.body as {
        response: string;
        evidence?: Record<string, unknown>;
      };

      if (!response || typeof response !== "string") {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "response is required" },
        });
        return;
      }

      const updated = await disputesService.respond(
        req.merchant.id, req.params.id, { response, evidence }
      );
      if (!updated) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Dispute not found" },
        });
        return;
      }
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  },
};
