// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Webhooks Controller
// ─────────────────────────────────────────────────────────────
import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types";
import { webhooksService } from "../services/webhooksService";

export const webhooksController = {
  async list(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const webhooks = await webhooksService.list(req.merchant.id);
      res.json({ success: true, data: webhooks });
    } catch (err) {
      next(err);
    }
  },

  async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { url, events, name } = req.body as {
        url: string;
        events: string[];
        name?: string;
      };

      if (!url || typeof url !== "string") {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "url is required" },
        });
        return;
      }

      if (!events || !Array.isArray(events) || events.length === 0) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "events array is required" },
        });
        return;
      }

      const webhook = await webhooksService.create(req.merchant.id, { url, events, name });
      res.status(201).json({ success: true, data: webhook });
    } catch (err) {
      next(err);
    }
  },

  async delete(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const deleted = await webhooksService.delete(req.merchant.id, req.params.id);
      if (!deleted) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Webhook not found" },
        });
        return;
      }
      res.json({ success: true, data: { message: "Webhook deleted" } });
    } catch (err) {
      next(err);
    }
  },

  async test(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await webhooksService.test(req.merchant.id, req.params.id);
      if (!result) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Webhook not found" },
        });
        return;
      }
      res.json({ success: true, data: { message: "Test event sent", status: result } });
    } catch (err) {
      next(err);
    }
  },
};
