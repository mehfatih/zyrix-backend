// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Admin Routes
// ─────────────────────────────────────────────────────────────
import { Router } from "express";
import { authenticateAdmin, requireSuperAdmin } from "../../middleware/adminAuth";
import { adminAuthController } from "../../controllers/admin/adminAuthController";
import { adminMerchantsController } from "../../controllers/admin/adminMerchantsController";
import { adminTransactionsController } from "../../controllers/admin/adminTransactionsController";
import { adminDisputesController } from "../../controllers/admin/adminDisputesController";
import { adminSettlementsController } from "../../controllers/admin/adminSettlementsController";
import { adminStatsController } from "../../controllers/admin/adminStatsController";

const router = Router();

// ─── Auth (public) ────────────────────────────────────────────
router.post("/login", adminAuthController.login);

// ─── Protected ────────────────────────────────────────────────
router.use(authenticateAdmin as any);

// Stats
router.get("/stats", adminStatsController.getStats as any);

// Merchants
router.get("/merchants",                    adminMerchantsController.list as any);
router.post("/merchants",                   adminMerchantsController.create as any);
router.get("/merchants/:id",                adminMerchantsController.getById as any);
router.put("/merchants/:id",                adminMerchantsController.update as any);
router.delete("/merchants/:id",             requireSuperAdmin as any, adminMerchantsController.remove as any);
router.put("/merchants/:id/status",         adminMerchantsController.updateStatus as any);
router.put("/merchants/:id/features",       adminMerchantsController.updateFeatures as any);
router.put("/merchants/:id/subscription",   adminMerchantsController.updateSubscription as any);

// Transactions
router.get("/transactions", adminTransactionsController.list as any);

// Disputes
router.get("/disputes",       adminDisputesController.list as any);
router.put("/disputes/:id",   adminDisputesController.update as any);

// Settlements
router.get("/settlements", adminSettlementsController.list as any);

export default router;
