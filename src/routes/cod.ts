// ─────────────────────────────────────────────────────────────
// Zyrix Backend — COD (Cash on Delivery) Routes
// ─────────────────────────────────────────────────────────────
import { Router, Request, Response, NextFunction } from "express";
import { authenticateToken } from "../middleware/auth";
import { codController } from "../controllers/codController";
import { AuthenticatedRequest } from "../types";

const router = Router();

router.use(authenticateToken);

router.get("/", (req: Request, res: Response, next: NextFunction) =>
  codController.list(req as AuthenticatedRequest, res, next));

router.post("/", (req: Request, res: Response, next: NextFunction) =>
  codController.create(req as AuthenticatedRequest, res, next));

router.put("/:id/collected", (req: Request, res: Response, next: NextFunction) =>
  codController.markCollected(req as AuthenticatedRequest, res, next));

router.get("/summary", (req: Request, res: Response, next: NextFunction) =>
  codController.summary(req as AuthenticatedRequest, res, next));

export default router;
