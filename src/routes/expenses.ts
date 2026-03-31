// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Expenses Routes
// ─────────────────────────────────────────────────────────────

import { Router, Request, Response, NextFunction } from "express";
import { authenticateToken } from "../middleware/auth";
import { expensesController } from "../controllers/expensesController";
import { AuthenticatedRequest } from "../types";

const router = Router();
router.use(authenticateToken);

router.get("/summary", (req: Request, res: Response, next: NextFunction) =>
  expensesController.summary(req as AuthenticatedRequest, res, next));

router.get("/", (req: Request, res: Response, next: NextFunction) =>
  expensesController.list(req as AuthenticatedRequest, res, next));

router.post("/", (req: Request, res: Response, next: NextFunction) =>
  expensesController.create(req as AuthenticatedRequest, res, next));

router.put("/:id", (req: Request, res: Response, next: NextFunction) =>
  expensesController.update(req as AuthenticatedRequest, res, next));

router.delete("/:id", (req: Request, res: Response, next: NextFunction) =>
  expensesController.delete(req as AuthenticatedRequest, res, next));

export default router;
