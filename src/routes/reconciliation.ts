// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Reconciliation Routes
// ─────────────────────────────────────────────────────────────
import { Router, Request, Response, NextFunction } from "express";
import { authenticateToken } from "../middleware/auth";
import { reconciliationController } from "../controllers/reconciliationController";
import { AuthenticatedRequest } from "../types";

const router = Router();

router.use(authenticateToken);

router.post(
  "/",
  (req: Request, res: Response, next: NextFunction) =>
    reconciliationController.generateReconciliation(req as AuthenticatedRequest, res, next)
);

router.get(
  "/",
  (req: Request, res: Response, next: NextFunction) =>
    reconciliationController.listReconciliations(req as AuthenticatedRequest, res, next)
);

router.get(
  "/:reportId",
  (req: Request, res: Response, next: NextFunction) =>
    reconciliationController.getReconciliation(req as AuthenticatedRequest, res, next)
);

export default router;
