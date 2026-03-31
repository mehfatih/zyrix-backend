// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Invoices Routes
// ─────────────────────────────────────────────────────────────

import { Router, Request, Response, NextFunction } from "express";
import { authenticateToken } from "../middleware/auth";
import { invoicesController } from "../controllers/invoicesController";
import { AuthenticatedRequest } from "../types";

const router = Router();
router.use(authenticateToken);

router.get("/", (req: Request, res: Response, next: NextFunction) =>
  invoicesController.list(req as AuthenticatedRequest, res, next));

router.post("/", (req: Request, res: Response, next: NextFunction) =>
  invoicesController.create(req as AuthenticatedRequest, res, next));

router.get("/:id", (req: Request, res: Response, next: NextFunction) =>
  invoicesController.getById(req as AuthenticatedRequest, res, next));

router.put("/:id", (req: Request, res: Response, next: NextFunction) =>
  invoicesController.update(req as AuthenticatedRequest, res, next));

router.delete("/:id", (req: Request, res: Response, next: NextFunction) =>
  invoicesController.delete(req as AuthenticatedRequest, res, next));

router.post("/:id/send", (req: Request, res: Response, next: NextFunction) =>
  invoicesController.send(req as AuthenticatedRequest, res, next));

export default router;
