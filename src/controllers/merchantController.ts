// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Merchant Controller
// ─────────────────────────────────────────────────────────────

import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types";
import { merchantService } from "../services/merchantService";
import { Language, Currency } from "@prisma/client";
import { z } from "zod";

const updateProfileSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  email: z.string().email().optional(),
  businessName: z.string().max(200).optional(),
  businessType: z.string().max(100).optional(),
});

const languageSchema = z.object({
  language: z.enum(["AR", "TR", "EN"]),
});

const currencySchema = z.object({
  currency: z.enum(["SAR", "TRY", "USD", "EUR", "AED", "KWD", "QAR"]),
});

export const merchantController = {
  async getProfile(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const merchant = await merchantService.getProfile(req.merchant.id);
      if (!merchant) {
        res.status(404).json({ success: false, error: { code: "MERCHANT_NOT_FOUND", message: "Merchant not found" } });
        return;
      }
      res.json({ success: true, data: merchant });
    } catch (err) {
      next(err);
    }
  },

  async updateProfile(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const body = updateProfileSchema.parse(req.body);
      const merchant = await merchantService.updateProfile(req.merchant.id, body);
      res.json({ success: true, data: merchant });
    } catch (err) {
      next(err);
    }
  },

  async updateLanguage(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { language } = languageSchema.parse(req.body);
      const result = await merchantService.updateLanguage(req.merchant.id, language as Language);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async updateCurrency(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { currency } = currencySchema.parse(req.body);
      const result = await merchantService.updateCurrency(req.merchant.id, currency as Currency);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async completeOnboarding(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await merchantService.completeOnboarding(req.merchant.id);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
};
