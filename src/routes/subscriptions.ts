// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Subscriptions Routes (Elite)
// ─────────────────────────────────────────────────────────────
import { Router, Request, Response, NextFunction } from "express";
import { authenticateToken } from "../middleware/auth";
import { subscriptionsController } from "../controllers/subscriptionsController";
import { AuthenticatedRequest } from "../types";

const router = Router();
router.use(authenticateToken);

// ─── Core ────────────────────────────────────────────────────
router.get("/", (req: Request, res: Response, next: NextFunction) =>
  subscriptionsController.list(req as AuthenticatedRequest, res, next));

router.post("/", (req: Request, res: Response, next: NextFunction) =>
  subscriptionsController.create(req as AuthenticatedRequest, res, next));

router.put("/:id", (req: Request, res: Response, next: NextFunction) =>
  subscriptionsController.update(req as AuthenticatedRequest, res, next));

router.post("/:id/cancel", (req: Request, res: Response, next: NextFunction) =>
  subscriptionsController.cancel(req as AuthenticatedRequest, res, next));

// ─── Elite: Smart Retry ──────────────────────────────────────
router.post("/:id/retry", (req: Request, res: Response, next: NextFunction) =>
  subscriptionsController.triggerSmartRetry(req as AuthenticatedRequest, res, next));

router.get("/:id/retry-status", (req: Request, res: Response, next: NextFunction) =>
  subscriptionsController.getRetryStatus(req as AuthenticatedRequest, res, next));

// ─── Elite: Dunning ──────────────────────────────────────────
router.post("/:id/dunning", (req: Request, res: Response, next: NextFunction) =>
  subscriptionsController.sendDunningNotice(req as AuthenticatedRequest, res, next));

router.get("/:id/dunning-history", (req: Request, res: Response, next: NextFunction) =>
  subscriptionsController.getDunningHistory(req as AuthenticatedRequest, res, next));

// ─── Elite: Churn Prediction ─────────────────────────────────
router.get("/churn/overview", (req: Request, res: Response, next: NextFunction) =>
  subscriptionsController.getChurnOverview(req as AuthenticatedRequest, res, next));

router.get("/:id/churn-score", (req: Request, res: Response, next: NextFunction) =>
  subscriptionsController.getChurnScore(req as AuthenticatedRequest, res, next));

export default router;
