// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Payout Scheduling Routes
// ─────────────────────────────────────────────────────────────
import { Router, Request, Response, NextFunction } from "express";
import { authenticateToken } from "../middleware/auth";
import { payoutSchedulingController } from "../controllers/payoutSchedulingController";
import { AuthenticatedRequest } from "../types";

const router = Router();
router.use(authenticateToken);

router.get("/",                    (req: Request, res: Response, next: NextFunction) =>
  payoutSchedulingController.list(req as AuthenticatedRequest, res, next));

router.post("/",                   (req: Request, res: Response, next: NextFunction) =>
  payoutSchedulingController.create(req as AuthenticatedRequest, res, next));

router.put("/:id",                 (req: Request, res: Response, next: NextFunction) =>
  payoutSchedulingController.update(req as AuthenticatedRequest, res, next));

router.delete("/:id",              (req: Request, res: Response, next: NextFunction) =>
  payoutSchedulingController.delete(req as AuthenticatedRequest, res, next));

router.post("/:id/execute",        (req: Request, res: Response, next: NextFunction) =>
  payoutSchedulingController.executePayout(req as AuthenticatedRequest, res, next));

router.get("/history",             (req: Request, res: Response, next: NextFunction) =>
  payoutSchedulingController.getHistory(req as AuthenticatedRequest, res, next));

router.get("/cashflow-insights",   (req: Request, res: Response, next: NextFunction) =>
  payoutSchedulingController.getCashflowInsights(req as AuthenticatedRequest, res, next));

export default router;
