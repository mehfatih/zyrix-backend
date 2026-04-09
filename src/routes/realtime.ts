// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Realtime Routes
// ─────────────────────────────────────────────────────────────
import { Router, Request, Response, NextFunction } from "express";
import { authenticateToken } from "../middleware/auth";
import { realtimeController } from "../controllers/realtimeController";
import { AuthenticatedRequest } from "../types";

const router = Router();

router.use(authenticateToken);

router.get(
  "/events",
  (req: Request, res: Response, next: NextFunction) =>
    realtimeController.streamEvents(req as AuthenticatedRequest, res, next)
);

router.get(
  "/history",
  (req: Request, res: Response, next: NextFunction) =>
    realtimeController.getEventHistory(req as AuthenticatedRequest, res, next)
);

export default router;
