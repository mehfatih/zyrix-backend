// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Dashboard Routes
// ─────────────────────────────────────────────────────────────

import { Router, Request, Response, NextFunction } from "express";
import { authenticateToken } from "../middleware/auth";
import { dashboardController } from "../controllers/dashboardController";
import { AuthenticatedRequest } from "../types";

const router = Router();

router.use(authenticateToken);

router.get(
  "/",
  (req: Request, res: Response, next: NextFunction) =>
    dashboardController.getDashboard(req as AuthenticatedRequest, res, next)
);

router.get(
  "/analytics",
  (req: Request, res: Response, next: NextFunction) =>
    dashboardController.getAnalytics(req as AuthenticatedRequest, res, next)
);

export default router;
