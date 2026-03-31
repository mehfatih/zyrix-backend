// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Balance Routes
// ─────────────────────────────────────────────────────────────

import { Router, Request, Response, NextFunction } from "express";
import { authenticateToken } from "../middleware/auth";
import { balanceController } from "../controllers/balanceController";
import { AuthenticatedRequest } from "../types";

const router = Router();

router.use(authenticateToken);

router.get(
  "/",
  (req: Request, res: Response, next: NextFunction) =>
    balanceController.getBalance(req as AuthenticatedRequest, res, next)
);

router.get(
  "/history",
  (req: Request, res: Response, next: NextFunction) =>
    balanceController.getHistory(req as AuthenticatedRequest, res, next)
);

export default router;
