// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Subscriptions Routes
// ─────────────────────────────────────────────────────────────

import { Router, Request, Response, NextFunction } from "express";
import { authenticateToken } from "../middleware/auth";
import { subscriptionsController } from "../controllers/subscriptionsController";
import { AuthenticatedRequest } from "../types";

const router = Router();
router.use(authenticateToken);

router.get("/", (req: Request, res: Response, next: NextFunction) =>
  subscriptionsController.list(req as AuthenticatedRequest, res, next));

router.post("/", (req: Request, res: Response, next: NextFunction) =>
  subscriptionsController.create(req as AuthenticatedRequest, res, next));

router.put("/:id", (req: Request, res: Response, next: NextFunction) =>
  subscriptionsController.update(req as AuthenticatedRequest, res, next));

router.post("/:id/cancel", (req: Request, res: Response, next: NextFunction) =>
  subscriptionsController.cancel(req as AuthenticatedRequest, res, next));

export default router;
