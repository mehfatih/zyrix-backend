// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Notifications Controller
// ─────────────────────────────────────────────────────────────

import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types";
import { notificationsService } from "../services/notificationsService";
import { parsePagination, buildMeta } from "../utils/pagination";

export const notificationsController = {
  async list(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const pagination = parsePagination(
        req.query.page as string,
        req.query.limit as string
      );
      const { data, total } = await notificationsService.list(
        req.merchant.id, pagination
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

  async markRead(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const n = await notificationsService.markRead(req.merchant.id, req.params.id);
      if (!n) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Notification not found" },
        });
        return;
      }
      res.json({ success: true, data: n });
    } catch (err) {
      next(err);
    }
  },

  async markAllRead(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await notificationsService.markAllRead(req.merchant.id);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async unreadCount(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const data = await notificationsService.unreadCount(req.merchant.id);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },
};
