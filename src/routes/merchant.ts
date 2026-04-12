import { Router } from "express";
import { authenticateToken } from "../middleware/auth";
import { merchantController } from "../controllers/merchantController";
import { AuthenticatedRequest } from "../types";
import { Request, Response, NextFunction } from "express";

const router = Router();
router.use(authenticateToken);

const wrap =
  (fn: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req as AuthenticatedRequest, res, next);

router.get("/profile",       wrap(merchantController.getProfile));
router.put("/profile",       wrap(merchantController.updateProfile));
router.put("/language",      wrap(merchantController.updateLanguage));
router.put("/currency",      wrap(merchantController.updateCurrency));
router.post("/onboarding",   wrap(merchantController.completeOnboarding));
router.delete("/account",    wrap(merchantController.deleteAccount));
router.get("/stats",         wrap(merchantController.getStats));
router.get("/transactions",  wrap(merchantController.getTransactions));
router.get("/settlements",   wrap(merchantController.getSettlements));
router.get("/balance",       wrap(merchantController.getBalance));
router.get("/payment-links", wrap(merchantController.getPaymentLinks));

export default router;
