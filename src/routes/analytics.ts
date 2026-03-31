// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Analytics Routes
// ─────────────────────────────────────────────────────────────

import { Router, Request, Response, NextFunction } from "express";
import { authenticateToken } from "../middleware/auth";
import { analyticsController } from "../controllers/analyticsController";
import { AuthenticatedRequest } from "../types";

const router = Router();

router.use(authenticateToken);

router.get(
  "/overview",
  (req: Request, res: Response, next: NextFunction) =>
    analyticsController.getOverview(req as AuthenticatedRequest, res, next)
);

router.get(
  "/volume",
  (req: Request, res: Response, next: NextFunction) =>
    analyticsController.getVolume(req as AuthenticatedRequest, res, next)
);

router.get(
  "/methods",
  (req: Request, res: Response, next: NextFunction) =>
    analyticsController.getMethods(req as AuthenticatedRequest, res, next)
);

router.get(
  "/countries",
  (req: Request, res: Response, next: NextFunction) =>
    analyticsController.getCountries(req as AuthenticatedRequest, res, next)
);

router.get(
  "/trends",
  (req: Request, res: Response, next: NextFunction) =>
    analyticsController.getTrends(req as AuthenticatedRequest, res, next)
);

export default router;
