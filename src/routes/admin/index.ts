// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Admin Routes
// ─────────────────────────────────────────────────────────────
import { Router, Request, Response } from "express";
import { authenticateAdmin, requireSuperAdmin } from "../../middleware/adminAuth";
import { adminAuthController } from "../../controllers/admin/adminAuthController";
import { adminMerchantsController } from "../../controllers/admin/adminMerchantsController";
import { adminTransactionsController } from "../../controllers/admin/adminTransactionsController";
import { adminDisputesController } from "../../controllers/admin/adminDisputesController";
import { adminSettlementsController } from "../../controllers/admin/adminSettlementsController";
import { adminStatsController } from "../../controllers/admin/adminStatsController";
import { adminFeaturesService } from "../../services/admin/adminFeaturesService";
import { prisma } from "../../config/database";
import bcrypt from "bcryptjs";

const router = Router();

// ─── Auth (public) ────────────────────────────────────────────
router.post("/login", adminAuthController.login);

// ─── Public Merchant Registration ────────────────────────────
router.post("/register", async (req: Request, res: Response) => {
  try {
    const { name, email, phone, businessName, businessType, country, currency, language } = req.body;

    if (!name || !email || !phone || !country) {
      res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "name, email, phone, country are required" },
      });
      return;
    }

    const existing = await prisma.merchant.findFirst({
      where: { OR: [{ email }, { phone }] },
    });

    if (existing) {
      res.status(409).json({
        success: false,
        error: { code: "DUPLICATE", message: "Merchant with this email or phone already exists" },
      });
      return;
    }

    const merchantId = `MRC-${Date.now()}`;
    const tempPassword = `Zyrix@${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const merchant = await prisma.merchant.create({
      data: {
        name, email, phone, merchantId,
        businessName, businessType, country,
        currency: currency ?? "SAR",
        language: language ?? "EN",
        passwordHash,
        status: "ACTIVE",
        onboardingDone: false,
      },
      select: {
        id: true, merchantId: true, name: true, email: true,
        phone: true, country: true, status: true, createdAt: true,
      },
    });

    await adminFeaturesService.applyPlanFeatures(merchant.id, "starter");

    res.status(201).json({
      success: true,
      data: { merchant },
    });
  } catch {
    res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Registration failed" },
    });
  }
});

// ─── Protected ────────────────────────────────────────────────
router.use(authenticateAdmin as any);

// Stats
router.get("/stats", adminStatsController.getStats as any);

// Merchants
router.get("/merchants",                  adminMerchantsController.list as any);
router.post("/merchants",                 adminMerchantsController.create as any);
router.get("/merchants/:id",              adminMerchantsController.getById as any);
router.put("/merchants/:id",              adminMerchantsController.update as any);
router.delete("/merchants/:id",           requireSuperAdmin as any, adminMerchantsController.remove as any);
router.put("/merchants/:id/status",       adminMerchantsController.updateStatus as any);
router.put("/merchants/:id/features",     adminMerchantsController.updateFeatures as any);
router.put("/merchants/:id/subscription", adminMerchantsController.updateSubscription as any);

// Transactions
router.get("/transactions", adminTransactionsController.list as any);

// Disputes
router.get("/disputes",     adminDisputesController.list as any);
router.put("/disputes/:id", adminDisputesController.update as any);

// Settlements
router.get("/settlements", adminSettlementsController.list as any);

export default router;
