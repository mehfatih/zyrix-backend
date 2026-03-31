// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Revenue Goals Routes
// ─────────────────────────────────────────────────────────────

import { Router, Request, Response, NextFunction } from "express";
import { authenticateToken } from "../middleware/auth";
import { revenueGoalsController } from "../controllers/revenueGoalsController";
import { AuthenticatedRequest } from "../types";

const router = Router();
router.use(authenticateToken);

router.get("/", (req: Request, res: Response, next: NextFunction) =>
  revenueGoalsController.list(req as AuthenticatedRequest, res, next));

router.post("/", (req: Request, res: Response, next: NextFunction) =>
  revenueGoalsController.create(req as AuthenticatedRequest, res, next));

router.put("/:id", (req: Request, res: Response, next: NextFunction) =>
  revenueGoalsController.update(req as AuthenticatedRequest, res, next));

router.delete("/:id", (req: Request, res: Response, next: NextFunction) =>
  revenueGoalsController.delete(req as AuthenticatedRequest, res, next));

export default router;
