// ─────────────────────────────────────────────────────────────
// Zyrix Backend — API Keys Routes
// ─────────────────────────────────────────────────────────────
import { Router, Request, Response, NextFunction } from "express";
import { authenticateToken } from "../middleware/auth";
import { apiKeysController } from "../controllers/apiKeysController";
import { AuthenticatedRequest } from "../types";

const router = Router();

router.use(authenticateToken);

router.get("/", (req: Request, res: Response, next: NextFunction) =>
  apiKeysController.list(req as AuthenticatedRequest, res, next));

router.post("/", (req: Request, res: Response, next: NextFunction) =>
  apiKeysController.create(req as AuthenticatedRequest, res, next));

router.delete("/:id", (req: Request, res: Response, next: NextFunction) =>
  apiKeysController.revoke(req as AuthenticatedRequest, res, next));

export default router;
