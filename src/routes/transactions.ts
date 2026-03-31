// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Transactions Routes
// ─────────────────────────────────────────────────────────────

import { Router, Request, Response, NextFunction } from "express";
import { authenticateToken } from "../middleware/auth";
import { transactionsController } from "../controllers/transactionsController";
import { AuthenticatedRequest } from "../types";

const router = Router();

router.use(authenticateToken);

// Stats and export must be defined before /:id to avoid route conflicts
router.get(
  "/stats",
  (req: Request, res: Response, next: NextFunction) =>
    transactionsController.getStats(req as AuthenticatedRequest, res, next)
);

router.get(
  "/export",
  (req: Request, res: Response, next: NextFunction) =>
    transactionsController.exportCsv(req as AuthenticatedRequest, res, next)
);

router.get(
  "/",
  (req: Request, res: Response, next: NextFunction) =>
    transactionsController.list(req as AuthenticatedRequest, res, next)
);

router.get(
  "/:id",
  (req: Request, res: Response, next: NextFunction) =>
    transactionsController.getById(req as AuthenticatedRequest, res, next)
);

export default router;
