// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Merchant Routes
// ─────────────────────────────────────────────────────────────

import { Router } from "express";
import { authenticateToken } from "../middleware/auth";
import { merchantController } from "../controllers/merchantController";
import { AuthenticatedRequest } from "../types";
import { Request, Response, NextFunction } from "express";

const router = Router();

// All routes require auth
router.use(authenticateToken);

router.get(
  "/profile",
  (req: Request, res: Response, next: NextFunction) =>
    merchantController.getProfile(req as AuthenticatedRequest, res, next)
);

router.put(
  "/profile",
  (req: Request, res: Response, next: NextFunction) =>
    merchantController.updateProfile(req as AuthenticatedRequest, res, next)
);

router.put(
  "/language",
  (req: Request, res: Response, next: NextFunction) =>
    merchantController.updateLanguage(req as AuthenticatedRequest, res, next)
);

router.put(
  "/currency",
  (req: Request, res: Response, next: NextFunction) =>
    merchantController.updateCurrency(req as AuthenticatedRequest, res, next)
);

router.post(
  "/onboarding",
  (req: Request, res: Response, next: NextFunction) =>
    merchantController.completeOnboarding(req as AuthenticatedRequest, res, next)
);

export default router;
