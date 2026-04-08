// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Payment Links Routes
// ─────────────────────────────────────────────────────────────

import { Router, Request, Response, NextFunction } from "express";
import { authenticateToken } from "../middleware/auth";
import { paymentLinksController } from "../controllers/paymentLinksController";
import { AuthenticatedRequest } from "../types";

const router = Router();

// ── Public routes (NO auth) ──────────────────────────────────
// Used by landing page: pay.zyrix.co / zyrix.co/[locale]/pay/[linkId]

router.get("/public/:linkId", (req: Request, res: Response, next: NextFunction) =>
  paymentLinksController.getPublic(req, res, next));

router.post("/public/:linkId/pay", (req: Request, res: Response, next: NextFunction) =>
  paymentLinksController.pay(req, res, next));

// ── Merchant routes (auth required) ─────────────────────────

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
