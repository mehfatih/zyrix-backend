// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Settlements Routes
// ─────────────────────────────────────────────────────────────

import { Router, Request, Response, NextFunction } from "express";
import { authenticateToken } from "../middleware/auth";
import { settlementsController } from "../controllers/settlementsController";
import { AuthenticatedRequest } from "../types";

const router = Router();
router.use(authenticateToken);

router.get(
  "/upcoming",
  (req: Request, res: Response, next: NextFunction) =>
    settlementsController.getUpcoming(req as AuthenticatedRequest, res, next)
);

router.get(
  "/",
  (req: Request, res: Response, next: NextFunction) =>
    settlementsController.list(req as AuthenticatedRequest, res, next)
);

router.get(
  "/:id",
  (req: Request, res: Response, next: NextFunction) =>
    settlementsController.getById(req as AuthenticatedRequest, res, next)
);

export default router;
