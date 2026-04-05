// ─────────────────────────────────────────────────────────────
// Zyrix Backend — API Keys Service
// ─────────────────────────────────────────────────────────────
import { prisma } from "../config/database";
import * as crypto from "crypto";

export const apiKeysService = {
  async list(merchantId: string) {
    const keys = await prisma.apiKey.findMany({
      where: { merchantId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        lastUsedAt: true,
        createdAt: true,
        isActive: true,
      },
    });
    return keys;
  },

  async create(merchantId: string, name?: string) {
    const rawKey = `sk_live_${crypto.randomBytes(32).toString("hex")}`;
    const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
    const keyPrefix = rawKey.substring(0, 16);

    const apiKey = await prisma.apiKey.create({
      data: {
        merchantId,
        name: name || "مفتاح جديد",
        keyHash,
        keyPrefix,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        createdAt: true,
        isActive: true,
      },
    });

    return { ...apiKey, fullKey: rawKey };
  },

  async revoke(merchantId: string, id: string) {
    const key = await prisma.apiKey.findFirst({
      where: { id, merchantId },
    });
    if (!key) return null;

    await prisma.apiKey.delete({ where: { id } });
    return true;
  },
};
