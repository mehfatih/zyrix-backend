// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Webhooks Routes
// ─────────────────────────────────────────────────────────────
import { Router, Request, Response, NextFunction } from "express";
import { authenticateToken } from "../middleware/auth";
import { webhooksController } from "../controllers/webhooksController";
import { AuthenticatedRequest } from "../types";

const router = Router();

router.use(authenticateToken);

router.get("/", (req: Request, res: Response, next: NextFunction) =>
  webhooksController.list(req as AuthenticatedRequest, res, next));

router.post("/", (req: Request, res: Response, next: NextFunction) =>
  webhooksController.create(req as AuthenticatedRequest, res, next));

router.delete("/:id", (req: Request, res: Response, next: NextFunction) =>
  webhooksController.delete(req as AuthenticatedRequest, res, next));

router.post("/:id/test", (req: Request, res: Response, next: NextFunction) =>
  webhooksController.test(req as AuthenticatedRequest, res, next));

export default router;
