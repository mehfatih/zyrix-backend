// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Payment Links Routes
// ─────────────────────────────────────────────────────────────

import { Router, Request, Response, NextFunction } from "express";
import { authenticateToken } from "../middleware/auth";
import { paymentLinksController } from "../controllers/paymentLinksController";
import { AuthenticatedRequest } from "../types";

const router = Router();
router.use(authenticateToken);

router.get("/", (req: Request, res: Response, next: NextFunction) =>
  paymentLinksController.list(req as AuthenticatedRequest, res, next));

router.post("/", (req: Request, res: Response, next: NextFunction) =>
  paymentLinksController.create(req as AuthenticatedRequest, res, next));

router.put("/:id", (req: Request, res: Response, next: NextFunction) =>
  paymentLinksController.update(req as AuthenticatedRequest, res, next));

router.delete("/:id", (req: Request, res: Response, next: NextFunction) =>
  paymentLinksController.delete(req as AuthenticatedRequest, res, next));

export default router;
