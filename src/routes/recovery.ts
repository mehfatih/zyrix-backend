// src/routes/recovery.ts
import { Router, Request, Response, NextFunction } from "express";
import { authenticateToken } from "../middleware/auth";
import { recoveryController } from "../controllers/recoveryController";
import { AuthenticatedRequest } from "../types";

const router = Router();
router.use(authenticateToken);

router.get("/campaigns",                         (req: Request, res: Response, next: NextFunction) => recoveryController.listCampaigns(req as AuthenticatedRequest, res, next));
router.post("/campaigns",                        (req: Request, res: Response, next: NextFunction) => recoveryController.createCampaign(req as AuthenticatedRequest, res, next));
router.put("/campaigns/:id",                     (req: Request, res: Response, next: NextFunction) => recoveryController.updateCampaign(req as AuthenticatedRequest, res, next));
router.delete("/campaigns/:id",                  (req: Request, res: Response, next: NextFunction) => recoveryController.deleteCampaign(req as AuthenticatedRequest, res, next));
router.post("/campaigns/:id/send",               (req: Request, res: Response, next: NextFunction) => recoveryController.sendCampaign(req as AuthenticatedRequest, res, next));
router.get("/campaigns/:campaignId/attempts",    (req: Request, res: Response, next: NextFunction) => recoveryController.getAttempts(req as AuthenticatedRequest, res, next));
router.patch("/attempts/:attemptId/recovered",   (req: Request, res: Response, next: NextFunction) => recoveryController.markRecovered(req as AuthenticatedRequest, res, next));
router.get("/stats",                             (req: Request, res: Response, next: NextFunction) => recoveryController.getStats(req as AuthenticatedRequest, res, next));

export default router;
