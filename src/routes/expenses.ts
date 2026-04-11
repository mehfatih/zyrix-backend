// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Expenses Routes (Elite)
// ─────────────────────────────────────────────────────────────
import { Router, Request, Response, NextFunction } from "express";
import { authenticateToken } from "../middleware/auth";
import { expensesController } from "../controllers/expensesController";
import { AuthenticatedRequest } from "../types";

const router = Router();
router.use(authenticateToken);

// ─── Core ────────────────────────────────────────────────────
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

// ─── Elite ───────────────────────────────────────────────────
router.get("/analytics", (req: Request, res: Response, next: NextFunction) =>
  expensesController.getAnalytics(req as AuthenticatedRequest, res, next));

router.post("/auto-import", (req: Request, res: Response, next: NextFunction) =>
  expensesController.autoImport(req as AuthenticatedRequest, res, next));

router.post("/refresh-analytics", (req: Request, res: Response, next: NextFunction) =>
  expensesController.refreshAnalytics(req as AuthenticatedRequest, res, next));

export default router;
