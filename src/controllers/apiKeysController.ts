// ─────────────────────────────────────────────────────────────
// Zyrix Backend — API Keys Controller
// ─────────────────────────────────────────────────────────────
import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types";
import { apiKeysService } from "../services/apiKeysService";

export const apiKeysController = {
  async list(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const keys = await apiKeysService.list(req.merchant.id);
      res.json({ success: true, data: keys });
    } catch (err) {
      next(err);
    }
  },

  async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { name } = req.body as { name?: string };
      const key = await apiKeysService.create(req.merchant.id, name);
      res.status(201).json({ success: true, data: key });
    } catch (err) {
      next(err);
    }
  },

  async revoke(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const deleted = await apiKeysService.revoke(req.merchant.id, req.params.id);
      if (!deleted) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "API key not found" },
        });
        return;
      }
      res.json({ success: true, data: { message: "API key revoked" } });
    } catch (err) {
      next(err);
    }
  },
};
