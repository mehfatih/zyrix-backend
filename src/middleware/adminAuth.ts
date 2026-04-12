// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Admin Routes
// ─────────────────────────────────────────────────────────────
import { Router, Request, Response } from "express";
import {
  authenticateAdmin,
  requireSuperAdmin,
  AdminRequest,
} from "../../middleware/adminAuth";
import { adminAuthService } from "../../services/admin/adminAuthService";
import { adminMerchantsService } from "../../services/admin/adminMerchantsService";
import { adminStatsService } from "../../services/admin/adminStatsService";
import { adminTransactionsService } from "../../services/admin/adminTransactionsService";
import { adminDisputesService } from "../../services/admin/adminDisputesService";
import { adminSettlementsService } from "../../services/admin/adminSettlementsService";
import { adminFeaturesService } from "../../services/admin/adminFeaturesService";
import { getPagination } from "../../utils/pagination";
import { prisma } from "../../config/database";
import bcrypt from "bcryptjs";

const router = Router();

// ─────────────────────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────────────────────

// POST /api/admin/auth/login
router.post("/auth/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "Email and password required" },
      });
      return;
    }

    const result = await adminAuthService.login(email, password);

    if (!result) {
      res.status(401).json({
        success: false,
        error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" },
      });
      return;
    }

    res.json({ success: true, data: result });
  } catch {
    res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Login failed" },
    });
  }
});

// POST /api/admin/auth/logout
router.post(
  "/auth/logout",
  authenticateAdmin,
  (_req: Request, res: Response) => {
    res.json({ success: true, data: { message: "Logged out successfully" } });
  }
);

// GET /api/admin/auth/me
router.get(
  "/auth/me",
  authenticateAdmin,
  async (req: Request, res: Response) => {
    const adminReq = req as AdminRequest;
    res.json({ success: true, data: adminReq.admin });
  }
);

// ─────────────────────────────────────────────────────────────
// STATS
// ─────────────────────────────────────────────────────────────

// GET /api/admin/stats
router.get(
  "/stats",
  authenticateAdmin,
  async (_req: Request, res: Response) => {
    try {
      const stats = await adminStatsService.getSystemStats();
      res.json({ success: true, data: stats });
    } catch {
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to fetch stats" },
      });
    }
  }
);

// ─────────────────────────────────────────────────────────────
// MERCHANTS
// ─────────────────────────────────────────────────────────────

// GET /api/admin/merchants
router.get(
  "/merchants",
  authenticateAdmin,
  async (req: Request, res: Response) => {
    try {
      const pagination = getPagination(req.query);
      const search = req.query.search as string | undefined;
      const result = await adminMerchantsService.list(pagination, search);
      res.json({
        success: true,
        data: result.data,
        meta: { total: result.total, ...pagination },
      });
    } catch {
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to fetch merchants" },
      });
    }
  }
);

// POST /api/admin/merchants
router.post(
  "/merchants",
  authenticateAdmin,
  async (req: Request, res: Response) => {
    try {
      const {
        name, email, phone, businessName,
        businessType, country, currency, language,
      } = req.body;

      if (!name || !email || !phone || !country) {
        res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "name, email, phone, country are required",
          },
        });
        return;
      }

      const existing = await prisma.merchant.findFirst({
        where: { OR: [{ email }, { phone }] },
      });

      if (existing) {
        res.status(409).json({
          success: false,
          error: {
            code: "DUPLICATE",
            message: "Merchant with this email or phone already exists",
          },
        });
        return;
      }

      const merchantId = `MRC-${Date.now()}`;
      const tempPassword = `Zyrix@${Math.random()
        .toString(36)
        .slice(2, 8)
        .toUpperCase()}`;
      const passwordHash = await bcrypt.hash(tempPassword, 10);

      const merchant = await prisma.merchant.create({
        data: {
          name,
          email,
          phone,
          merchantId,
          businessName,
          businessType,
          country,
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
        data: { merchant, tempPassword },
      });
    } catch {
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to create merchant" },
      });
    }
  }
);

// GET /api/admin/merchants/:id
router.get(
  "/merchants/:id",
  authenticateAdmin,
  async (req: Request, res: Response) => {
    try {
      const merchant = await adminMerchantsService.getById(req.params.id);

      if (!merchant) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Merchant not found" },
        });
        return;
      }

      const [subscription, features] = await Promise.all([
        adminFeaturesService.getMerchantSubscription(req.params.id),
        adminFeaturesService.getMerchantFeatures(req.params.id),
      ]);

      res.json({
        success: true,
        data: { ...merchant, subscription, features },
      });
    } catch {
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to fetch merchant" },
      });
    }
  }
);

// PUT /api/admin/merchants/:id
router.put(
  "/merchants/:id",
  authenticateAdmin,
  async (req: Request, res: Response) => {
    try {
      const {
        name, email, phone, businessName,
        businessType, country, currency, language, kycStatus,
      } = req.body;

      const merchant = await prisma.merchant.update({
        where: { id: req.params.id },
        data: {
          ...(name && { name }),
          ...(email && { email }),
          ...(phone && { phone }),
          ...(businessName !== undefined && { businessName }),
          ...(businessType !== undefined && { businessType }),
          ...(country && { country }),
          ...(currency && { currency }),
          ...(language && { language }),
          ...(kycStatus && { kycStatus }),
        },
        select: {
          id: true, merchantId: true, name: true, email: true,
          phone: true, status: true, kycStatus: true, updatedAt: true,
        },
      });

      res.json({ success: true, data: merchant });
    } catch (err: unknown) {
      const prismaErr = err as { code?: string };
      if (prismaErr?.code === "P2025") {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Merchant not found" },
        });
        return;
      }
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to update merchant" },
      });
    }
  }
);

// DELETE /api/admin/merchants/:id
router.delete(
  "/merchants/:id",
  authenticateAdmin,
  requireSuperAdmin,
  async (req: Request, res: Response) => {
    try {
      await prisma.merchant.delete({ where: { id: req.params.id } });
      res.json({
        success: true,
        data: { message: "Merchant deleted successfully" },
      });
    } catch (err: unknown) {
      const prismaErr = err as { code?: string };
      if (prismaErr?.code === "P2025") {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Merchant not found" },
        });
        return;
      }
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to delete merchant" },
      });
    }
  }
);

// PUT /api/admin/merchants/:id/status
router.put(
  "/merchants/:id/status",
  authenticateAdmin,
  async (req: Request, res: Response) => {
    try {
      const { status } = req.body;

      if (!["ACTIVE", "SUSPENDED", "PENDING_KYC"].includes(status)) {
        res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid status. Use: ACTIVE, SUSPENDED, PENDING_KYC",
          },
        });
        return;
      }

      const merchant = await adminMerchantsService.updateStatus(
        req.params.id,
        status
      );
      res.json({ success: true, data: merchant });
    } catch (err: unknown) {
      const prismaErr = err as { code?: string };
      if (prismaErr?.code === "P2025") {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Merchant not found" },
        });
        return;
      }
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to update status" },
      });
    }
  }
);

// PUT /api/admin/merchants/:id/features
router.put(
  "/merchants/:id/features",
  authenticateAdmin,
  async (req: Request, res: Response) => {
    try {
      const { features } = req.body;

      if (!Array.isArray(features)) {
        res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "features must be an array of { key, enabled }",
          },
        });
        return;
      }

      const result = await adminFeaturesService.updateMerchantFeatures(
        req.params.id,
        features
      );
      res.json({ success: true, data: result });
    } catch {
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to update features" },
      });
    }
  }
);

// PUT /api/admin/merchants/:id/subscription
router.put(
  "/merchants/:id/subscription",
  authenticateAdmin,
  async (req: Request, res: Response) => {
    try {
      const { plan, status, endDate } = req.body;

      if (!["starter", "growth", "elite", "enterprise"].includes(plan)) {
        res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid plan. Use: starter, growth, elite, enterprise",
          },
        });
        return;
      }

      const subscription = await adminFeaturesService.updateMerchantSubscription(
        req.params.id,
        {
          plan,
          status: status ?? "active",
          endDate: endDate ? new Date(endDate) : undefined,
        }
      );

      await adminFeaturesService.applyPlanFeatures(req.params.id, plan);

      res.json({ success: true, data: subscription });
    } catch {
      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to update subscription",
        },
      });
    }
  }
);

// ─────────────────────────────────────────────────────────────
// TRANSACTIONS
// ─────────────────────────────────────────────────────────────

// GET /api/admin/transactions
router.get(
  "/transactions",
  authenticateAdmin,
  async (req: Request, res: Response) => {
    try {
      const pagination = getPagination(req.query);
      const result = await adminTransactionsService.list(
        pagination,
        req.query as Record<string, unknown>
      );
      res.json({
        success: true,
        data: result.data,
        meta: { total: result.total, ...pagination },
      });
    } catch {
      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to fetch transactions",
        },
      });
    }
  }
);

// ─────────────────────────────────────────────────────────────
// DISPUTES
// ─────────────────────────────────────────────────────────────

// GET /api/admin/disputes
router.get(
  "/disputes",
  authenticateAdmin,
  async (req: Request, res: Response) => {
    try {
      const pagination = getPagination(req.query);
      const result = await adminDisputesService.list(
        pagination,
        req.query.status as string
      );
      res.json({
        success: true,
        data: result.data,
        meta: { total: result.total, ...pagination },
      });
    } catch {
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to fetch disputes" },
      });
    }
  }
);

// PUT /api/admin/disputes/:id
router.put(
  "/disputes/:id",
  authenticateAdmin,
  async (req: Request, res: Response) => {
    try {
      const result = await adminDisputesService.update(
        req.params.id,
        req.body
      );
      res.json({ success: true, data: result });
    } catch (err: unknown) {
      const prismaErr = err as { code?: string };
      if (prismaErr?.code === "P2025") {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Dispute not found" },
        });
        return;
      }
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to update dispute" },
      });
    }
  }
);

// ─────────────────────────────────────────────────────────────
// SETTLEMENTS
// ─────────────────────────────────────────────────────────────

// GET /api/admin/settlements
router.get(
  "/settlements",
  authenticateAdmin,
  async (req: Request, res: Response) => {
    try {
      const pagination = getPagination(req.query);
      const result = await adminSettlementsService.list(
        pagination,
        req.query.status as string
      );
      res.json({
        success: true,
        data: result.data,
        meta: { total: result.total, ...pagination },
      });
    } catch {
      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to fetch settlements",
        },
      });
    }
  }
);

export default router;
