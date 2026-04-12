// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Admin Merchants Controller
// ─────────────────────────────────────────────────────────────
import { Request, Response, NextFunction } from "express";
import { AdminRequest } from "../../middleware/adminAuth";
import { adminMerchantsService } from "../../services/admin/adminMerchantsService";
import { adminFeaturesService } from "../../services/admin/adminFeaturesService";
import { parsePagination, buildMeta } from "../../utils/pagination";
import { MerchantStatus } from "@prisma/client";
import { prisma } from "../../config/database";
import bcrypt from "bcryptjs";

export const adminMerchantsController = {
  async list(req: AdminRequest, res: Response, next: NextFunction) {
    try {
      const pagination = parsePagination(req.query.page as string, req.query.limit as string);
      const { data, total } = await adminMerchantsService.list(pagination, req.query.search as string);
      res.json({ success: true, data, meta: buildMeta(pagination.page, pagination.limit, total) });
    } catch (err) { next(err); }
  },

  async getById(req: AdminRequest, res: Response, next: NextFunction) {
    try {
      const merchant = await adminMerchantsService.getById(req.params.id);
      if (!merchant) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Merchant not found" } });
        return;
      }
      const [subscription, features] = await Promise.all([
        adminFeaturesService.getMerchantSubscription(req.params.id),
        adminFeaturesService.getMerchantFeatures(req.params.id),
      ]);
      res.json({ success: true, data: { ...merchant, subscription, features } });
    } catch (err) { next(err); }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, email, phone, businessName, businessType, country, currency, language } = req.body;

      if (!name || !email || !phone || !country) {
        res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "name, email, phone, country are required" } });
        return;
      }

      const existing = await prisma.merchant.findFirst({ where: { OR: [{ email }, { phone }] } });
      if (existing) {
        res.status(409).json({ success: false, error: { code: "DUPLICATE", message: "Merchant with this email or phone already exists" } });
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

      res.status(201).json({ success: true, data: { merchant, tempPassword } });
    } catch (err) { next(err); }
  },

  async update(req: AdminRequest, res: Response, next: NextFunction) {
    try {
      const { name, email, phone, businessName, businessType, country, currency, language, kycStatus } = req.body;

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
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Merchant not found" } });
        return;
      }
      next(err);
    }
  },

  async remove(req: AdminRequest, res: Response, next: NextFunction) {
    try {
      await prisma.merchant.delete({ where: { id: req.params.id } });
      res.json({ success: true, data: { message: "Merchant deleted successfully" } });
    } catch (err: unknown) {
      const prismaErr = err as { code?: string };
      if (prismaErr?.code === "P2025") {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Merchant not found" } });
        return;
      }
      next(err);
    }
  },

  async updateStatus(req: AdminRequest, res: Response, next: NextFunction) {
    try {
      const { status } = req.body;
      if (!["ACTIVE", "SUSPENDED", "PENDING_KYC"].includes(status)) {
        res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Invalid status" } });
        return;
      }
      const merchant = await adminMerchantsService.updateStatus(req.params.id, status as MerchantStatus);
      res.json({ success: true, data: merchant });
    } catch (err) { next(err); }
  },

  async updateFeatures(req: AdminRequest, res: Response, next: NextFunction) {
    try {
      const { features } = req.body;
      if (!Array.isArray(features)) {
        res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "features must be an array of { key, enabled }" } });
        return;
      }
      const result = await adminFeaturesService.updateMerchantFeatures(req.params.id, features);
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  },

  async updateSubscription(req: AdminRequest, res: Response, next: NextFunction) {
    try {
      const { plan, status, endDate } = req.body;
      if (!["starter", "growth", "elite", "enterprise"].includes(plan)) {
        res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Invalid plan. Use: starter, growth, elite, enterprise" } });
        return;
      }
      const subscription = await adminFeaturesService.updateMerchantSubscription(req.params.id, {
        plan,
        status: status ?? "active",
        endDate: endDate ? new Date(endDate) : undefined,
      });
      await adminFeaturesService.applyPlanFeatures(req.params.id, plan);
      res.json({ success: true, data: subscription });
    } catch (err) { next(err); }
  },
};
