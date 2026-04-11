// src/routes/tax.ts
import { Router, Request, Response, NextFunction } from "express";
import { authenticateToken } from "../middleware/auth";
import { taxController } from "../controllers/taxController";
import { AuthenticatedRequest } from "../types";

const router = Router();
router.use(authenticateToken);

router.get("/rules",           (req: Request, res: Response, next: NextFunction) => taxController.listRules(req as AuthenticatedRequest, res, next));
router.post("/rules",          (req: Request, res: Response, next: NextFunction) => taxController.upsertRule(req as AuthenticatedRequest, res, next));
router.post("/calculate",      (req: Request, res: Response, next: NextFunction) => taxController.calculate(req as AuthenticatedRequest, res, next));
router.post("/bulk-calculate", (req: Request, res: Response, next: NextFunction) => taxController.bulkCalculate(req as AuthenticatedRequest, res, next));
router.get("/period-report",   (req: Request, res: Response, next: NextFunction) => taxController.getPeriodReport(req as AuthenticatedRequest, res, next));
router.get("/country-rates",   (req: Request, res: Response, next: NextFunction) => taxController.getCountryRates(req as AuthenticatedRequest, res, next));

export default router;
