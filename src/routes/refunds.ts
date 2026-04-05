// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Refunds Routes
// ─────────────────────────────────────────────────────────────
import { Router, Request, Response, NextFunction } from "express";
import { authenticateToken } from "../middleware/auth";
import { refundsController } from "../controllers/refundsController";
import { AuthenticatedRequest } from "../types";

const router = Router();

router.use(authenticateToken);

router.get(
  "/",
  (req: Request, res: Response, next: NextFunction) =>
    refundsController.list(req as AuthenticatedRequest, res, next)
);

router.get(
  "/:id",
  (req: Request, res: Response, next: NextFunction) =>
    refundsController.getById(req as AuthenticatedRequest, res, next)
);

router.post(
  "/",
  (req: Request, res: Response, next: NextFunction) =>
    refundsController.create(req as AuthenticatedRequest, res, next)
);

export default router;
