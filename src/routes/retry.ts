// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Retry Routes
// ─────────────────────────────────────────────────────────────
import { Router, Request, Response, NextFunction } from "express";
import { authenticateToken } from "../middleware/auth";
import { retryController } from "../controllers/retryController";
import { AuthenticatedRequest } from "../types";

const router = Router();

router.use(authenticateToken);

router.get(
  "/failed",
  (req: Request, res: Response, next: NextFunction) =>
    retryController.getFailedTransactions(req as AuthenticatedRequest, res, next)
);

router.post(
  "/:transactionId",
  (req: Request, res: Response, next: NextFunction) =>
    retryController.retryTransaction(req as AuthenticatedRequest, res, next)
);

router.get(
  "/:transactionId/logs",
  (req: Request, res: Response, next: NextFunction) =>
    retryController.getRetryLogs(req as AuthenticatedRequest, res, next)
);

export default router;
