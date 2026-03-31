// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Disputes Routes
// ─────────────────────────────────────────────────────────────

import { Router, Request, Response, NextFunction } from "express";
import { authenticateToken } from "../middleware/auth";
import { disputesController } from "../controllers/disputesController";
import { AuthenticatedRequest } from "../types";

const router = Router();
router.use(authenticateToken);

router.get(
  "/",
  (req: Request, res: Response, next: NextFunction) =>
    disputesController.list(req as AuthenticatedRequest, res, next)
);

router.get(
  "/:id",
  (req: Request, res: Response, next: NextFunction) =>
    disputesController.getById(req as AuthenticatedRequest, res, next)
);

router.put(
  "/:id/respond",
  (req: Request, res: Response, next: NextFunction) =>
    disputesController.respond(req as AuthenticatedRequest, res, next)
);

export default router;
