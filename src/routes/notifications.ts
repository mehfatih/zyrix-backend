// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Notifications Routes
// ─────────────────────────────────────────────────────────────

import { Router, Request, Response, NextFunction } from "express";
import { authenticateToken } from "../middleware/auth";
import { notificationsController } from "../controllers/notificationsController";
import { AuthenticatedRequest } from "../types";

const router = Router();
router.use(authenticateToken);

// Static routes before parameterized ones
router.get(
  "/unread-count",
  (req: Request, res: Response, next: NextFunction) =>
    notificationsController.unreadCount(req as AuthenticatedRequest, res, next)
);

router.put(
  "/read-all",
  (req: Request, res: Response, next: NextFunction) =>
    notificationsController.markAllRead(req as AuthenticatedRequest, res, next)
);

router.get(
  "/",
  (req: Request, res: Response, next: NextFunction) =>
    notificationsController.list(req as AuthenticatedRequest, res, next)
);

router.put(
  "/:id/read",
  (req: Request, res: Response, next: NextFunction) =>
    notificationsController.markRead(req as AuthenticatedRequest, res, next)
);

export default router;
