// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Admin Merchants Service
// ─────────────────────────────────────────────────────────────

import { prisma } from "../../config/database";
import { PaginationParams } from "../../utils/pagination";
import { MerchantStatus } from "@prisma/client";

export const adminMerchantsService = {
  async list(pagination: PaginationParams, search?: string) {
    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
            { merchantId: { contains: search, mode: "insensitive" as const } },
            { businessName: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {};

    const [merchants, total] = await Promise.all([
      prisma.merchant.findMany({
        where,
        select: {
          id: true, merchantId: true, name: true, email: true, phone: true,
          businessName: true, businessType: true, country: true,
          status: true, kycStatus: true, currency: true,
          onboardingDone: true, createdAt: true,
          _count: { select: { transactions: true, disputes: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: pagination.skip,
        take: pagination.limit,
      }),
      prisma.merchant.count({ where }),
    ]);
    return { data: merchants, total };
  },

  async getById(id: string) {
    const merchant = await prisma.merchant.findUnique({
      where: { id },
      select: {
        id: true, merchantId: true, name: true, email: true, phone: true,
        businessName: true, businessType: true, country: true, timezone: true,
        language: true, currency: true, status: true, kycStatus: true,
        onboardingDone: true, createdAt: true, updatedAt: true,
        _count: { select: { transactions: true, disputes: true, settlements: true } },
      },
    });
    if (!merchant) return null;

    const [txStats, revenue] = await Promise.all([
      prisma.transaction.aggregate({
        where: { merchantId: id },
        _count: true,
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: { merchantId: id, status: "SUCCESS", isCredit: true },
        _sum: { amount: true },
      }),
    ]);

    return {
      ...merchant,
      stats: {
        totalTransactions: txStats._count,
        totalVolume: parseFloat((txStats._sum.amount ?? 0).toString()),
        totalRevenue: parseFloat((revenue._sum.amount ?? 0).toString()),
      },
    };
  },

  async updateStatus(id: string, status: MerchantStatus) {
    return prisma.merchant.update({
      where: { id },
      data: { status },
      select: { id: true, merchantId: true, name: true, status: true },
    });
  },
};
