// ─────────────────────────────────────────────────────────────
// FILE 1: src/routes/commission.ts
// ─────────────────────────────────────────────────────────────
import { Router, Request, Response, NextFunction } from "express";
import { authenticateToken } from "../middleware/auth";
import { commissionController } from "../controllers/commissionController";
import { AuthenticatedRequest } from "../types";

const commissionRouter = Router();
commissionRouter.use(authenticateToken);

commissionRouter.get("/rules",              (req: Request, res: Response, next: NextFunction) => commissionController.listRules(req as AuthenticatedRequest, res, next));
commissionRouter.post("/rules",             (req: Request, res: Response, next: NextFunction) => commissionController.createRule(req as AuthenticatedRequest, res, next));
commissionRouter.put("/rules/:id",          (req: Request, res: Response, next: NextFunction) => commissionController.updateRule(req as AuthenticatedRequest, res, next));
commissionRouter.delete("/rules/:id",       (req: Request, res: Response, next: NextFunction) => commissionController.deleteRule(req as AuthenticatedRequest, res, next));
commissionRouter.post("/calculate",         (req: Request, res: Response, next: NextFunction) => commissionController.calculate(req as AuthenticatedRequest, res, next));
commissionRouter.post("/bulk-calculate",    (req: Request, res: Response, next: NextFunction) => commissionController.bulkCalculate(req as AuthenticatedRequest, res, next));
commissionRouter.get("/history",            (req: Request, res: Response, next: NextFunction) => commissionController.getHistory(req as AuthenticatedRequest, res, next));
commissionRouter.get("/summary",            (req: Request, res: Response, next: NextFunction) => commissionController.getSummary(req as AuthenticatedRequest, res, next));
commissionRouter.get("/partners",           (req: Request, res: Response, next: NextFunction) => commissionController.listPartners(req as AuthenticatedRequest, res, next));
commissionRouter.post("/partners",          (req: Request, res: Response, next: NextFunction) => commissionController.createPartner(req as AuthenticatedRequest, res, next));

export default commissionRouter;
