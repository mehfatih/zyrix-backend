// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Webhooks Service
// ─────────────────────────────────────────────────────────────
import { prisma } from "../config/database";
import * as crypto from "crypto";

export const webhooksService = {
  async list(merchantId: string) {
    return prisma.webhook.findMany({
      where: { merchantId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        url: true,
        events: true,
        isActive: true,
        lastTriggeredAt: true,
        failureCount: true,
        createdAt: true,
      },
    });
  },

  async create(merchantId: string, data: { url: string; events: string[]; name?: string }) {
    const secret = `whsec_${crypto.randomBytes(32).toString("hex")}`;

    return prisma.webhook.create({
      data: {
        merchantId,
        name: data.name || "Webhook جديد",
        url: data.url,
        events: data.events,
        secret,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        url: true,
        events: true,
        isActive: true,
        createdAt: true,
      },
    });
  },

  async delete(merchantId: string, id: string) {
    const webhook = await prisma.webhook.findFirst({
      where: { id, merchantId },
    });
    if (!webhook) return null;

    await prisma.webhook.delete({ where: { id } });
    return true;
  },

  async test(merchantId: string, id: string) {
    const webhook = await prisma.webhook.findFirst({
      where: { id, merchantId },
    });
    if (!webhook) return null;

    // Simulate sending test event
    try {
      await fetch(webhook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Zyrix-Event": "test",
          "X-Zyrix-Signature": crypto
            .createHmac("sha256", webhook.secret)
            .update(JSON.stringify({ event: "test", timestamp: Date.now() }))
            .digest("hex"),
        },
        body: JSON.stringify({
          event: "test",
          data: { message: "Zyrix webhook test event" },
          timestamp: new Date().toISOString(),
        }),
      });

      await prisma.webhook.update({
        where: { id },
        data: { lastTriggeredAt: new Date(), failureCount: 0 },
      });

      return "delivered";
    } catch {
      await prisma.webhook.update({
        where: { id },
        data: { failureCount: { increment: 1 } },
      });
      return "failed";
    }
  },
};
