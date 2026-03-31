// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Merchant Service
// ─────────────────────────────────────────────────────────────

import { prisma } from "../config/database";
import { Language, Currency } from "@prisma/client";

export const merchantService = {
  async getProfile(merchantId: string) {
    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        merchantId: true,
        language: true,
        currency: true,
        status: true,
        kycStatus: true,
        businessName: true,
        businessType: true,
        country: true,
        timezone: true,
        onboardingDone: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return merchant;
  },

  async updateProfile(
    merchantId: string,
    data: {
      name?: string;
      email?: string;
      businessName?: string;
      businessType?: string;
    }
  ) {
    return prisma.merchant.update({
      where: { id: merchantId },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        merchantId: true,
        language: true,
        currency: true,
        status: true,
        kycStatus: true,
        businessName: true,
        businessType: true,
        country: true,
        timezone: true,
        onboardingDone: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  },

  async updateLanguage(merchantId: string, language: Language) {
    return prisma.merchant.update({
      where: { id: merchantId },
      data: { language },
      select: { id: true, language: true },
    });
  },

  async updateCurrency(merchantId: string, currency: Currency) {
    return prisma.merchant.update({
      where: { id: merchantId },
      data: { currency },
      select: { id: true, currency: true },
    });
  },

  async completeOnboarding(merchantId: string) {
    return prisma.merchant.update({
      where: { id: merchantId },
      data: { onboardingDone: true },
      select: { id: true, onboardingDone: true },
    });
  },
};
