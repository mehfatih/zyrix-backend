// src/routes/financialReports.ts
import { Router, Request, Response, NextFunction } from "express";
import { authenticateToken } from "../middleware/auth";
import { financialReportsController } from "../controllers/financialReportsController";
import { AuthenticatedRequest } from "../types";

const router = Router();
router.use(authenticateToken);

router.get("/",             (req: Request, res: Response, next: NextFunction) => financialReportsController.list(req as AuthenticatedRequest, res, next));
router.post("/generate",    (req: Request, res: Response, next: NextFunction) => financialReportsController.generate(req as AuthenticatedRequest, res, next));
router.get("/quick-pnl",    (req: Request, res: Response, next: NextFunction) => financialReportsController.getQuickPNL(req as AuthenticatedRequest, res, next));
router.get("/:id",          (req: Request, res: Response, next: NextFunction) => financialReportsController.getById(req as AuthenticatedRequest, res, next));
router.delete("/:id",       (req: Request, res: Response, next: NextFunction) => financialReportsController.delete(req as AuthenticatedRequest, res, next));

export default router;
