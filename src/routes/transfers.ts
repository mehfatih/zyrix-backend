// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Transfers Routes
// ─────────────────────────────────────────────────────────────
import { Router, Request, Response, NextFunction } from "express";
import { authenticateToken } from "../middleware/auth";
import { transfersController } from "../controllers/transfersController";
import { AuthenticatedRequest } from "../types";

const router = Router();

router.use(authenticateToken);

router.get(
  "/",
  (req: Request, res: Response, next: NextFunction) =>
    transfersController.list(req as AuthenticatedRequest, res, next)
);

router.post(
  "/",
  (req: Request, res: Response, next: NextFunction) =>
    transfersController.create(req as AuthenticatedRequest, res, next)
);

export default router;
