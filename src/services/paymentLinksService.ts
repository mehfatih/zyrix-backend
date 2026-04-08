// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Payment Links Service
// ─────────────────────────────────────────────────────────────

import { prisma } from "../config/database";
import { Decimal } from "@prisma/client/runtime/library";
import { env } from "../config/env";

function toNumNull(d: Decimal | null | undefined): number | null {
  return d ? parseFloat(d.toString()) : null;
}

function genLinkId(): string {
  const rand = Math.floor(10000 + Math.random() * 90000);
  return `ZRX-PL-${rand}`;
}

function genTxId(): string {
  return `ZRX-TX-${Date.now().toString().slice(-8)}`;
}

const linkSelect = {
  id: true, linkId: true, title: true, description: true,
  amount: true, minAmount: true, maxAmount: true,
  currency: true, url: true, status: true,
  expiresAt: true, usageCount: true, paidCount: true,
  features: true, faqs: true, allowNote: true, showQr: true,
  createdAt: true,
};

export const paymentLinksService = {

  async list(merchantId: string, pagination: { skip: number; limit: number }) {
    const [links, total] = await Promise.all([
      prisma.paymentLink.findMany({
        where: { merchantId },
        select: linkSelect,
        orderBy: { createdAt: "desc" },
        skip: pagination.skip,
        take: pagination.limit,
      }),
      prisma.paymentLink.count({ where: { merchantId } }),
    ]);
    return {
      data: links.map((l) => ({
        ...l,
        amount: toNumNull(l.amount),
        minAmount: toNumNull(l.minAmount),
        maxAmount: toNumNull(l.maxAmount),
        features: l.features ? JSON.parse(l.features) : [],
        faqs: l.faqs ? JSON.parse(l.faqs) : [],
      })),
      total,
    };
  },

  async create(
    merchantId: string,
    body: {
      title: string; amount?: number; minAmount?: number; maxAmount?: number;
      currency: string; description?: string; expiresAt?: string;
      features?: string[]; faqs?: { q: string; a: string }[];
      allowNote?: boolean; showQr?: boolean;
    }
  ) {
    const linkId = genLinkId();
    const baseUrl = (env as unknown as Record<string, string>).appUrl ?? "https://zyrix.co";
    const url = `${baseUrl}/ar/pay/${linkId}`;

    const link = await prisma.paymentLink.create({
      data: {
        merchantId, linkId, url,
        title: body.title,
        description: body.description ?? null,
        amount: body.amount !== undefined ? body.amount : null,
        minAmount: body.minAmount ?? null,
        maxAmount: body.maxAmount ?? null,
        currency: body.currency.toUpperCase(),
        status: "ACTIVE",
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        features: body.features ? JSON.stringify(body.features) : null,
        faqs: body.faqs ? JSON.stringify(body.faqs) : null,
        allowNote: body.allowNote ?? false,
        showQr: body.showQr ?? true,
      },
      select: linkSelect,
    });
    return {
      ...link,
      amount: toNumNull(link.amount),
      minAmount: toNumNull(link.minAmount),
      maxAmount: toNumNull(link.maxAmount),
      features: link.features ? JSON.parse(link.features) : [],
      faqs: link.faqs ? JSON.parse(link.faqs) : [],
    };
  },

  // Public: get link by linkId (no auth required)
  async getPublic(linkId: string) {
    const link = await prisma.paymentLink.findUnique({
      where: { linkId },
      select: {
        ...linkSelect,
        merchant: { select: { name: true, company: true } },
      },
    });
    if (!link) return null;

    // Auto-expire check
    if (link.status === "ACTIVE" && link.expiresAt && new Date(link.expiresAt) < new Date()) {
      await prisma.paymentLink.update({ where: { linkId }, data: { status: "EXPIRED" } });
      link.status = "EXPIRED";
    }

    // Increment view count
    await prisma.paymentLink.update({ where: { linkId }, data: { usageCount: { increment: 1 } } });

    return {
      ...link,
      amount: toNumNull(link.amount),
      minAmount: toNumNull(link.minAmount),
      maxAmount: toNumNull(link.maxAmount),
      features: link.features ? JSON.parse(link.features) : [],
      faqs: link.faqs ? JSON.parse(link.faqs) : [],
      merchant: {
        name: (link as any).merchant?.name ?? "",
        company: (link as any).merchant?.company ?? "",
        verified: true,
      },
    };
  },

  // Public: record payment (no auth required)
  async recordPayment(
    linkId: string,
    body: {
      amount: number; payerName: string; payerPhone: string; payerNote?: string;
      utmSource?: string; utmMedium?: string; utmCampaign?: string;
    }
  ) {
    const link = await prisma.paymentLink.findUnique({ where: { linkId } });
    if (!link) return null;
    if (link.status !== "ACTIVE") return { error: "LINK_INACTIVE" };
    if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
      await prisma.paymentLink.update({ where: { linkId }, data: { status: "EXPIRED" } });
      return { error: "LINK_EXPIRED" };
    }

    const txId = genTxId();
    const [payment] = await prisma.$transaction([
      prisma.linkPayment.create({
        data: {
          linkId: link.id, txId,
          amount: body.amount, currency: link.currency,
          payerName: body.payerName, payerPhone: body.payerPhone,
          payerNote: body.payerNote ?? null,
          utmSource: body.utmSource ?? null,
          utmMedium: body.utmMedium ?? null,
          utmCampaign: body.utmCampaign ?? null,
        },
      }),
      prisma.paymentLink.update({
        where: { linkId },
        data: { paidCount: { increment: 1 } },
      }),
    ]);

    return { txId: payment.txId, amount: body.amount, currency: link.currency };
  },

  async update(merchantId: string, id: string, body: Partial<{ title: string; amount: number; currency: string; expiresAt: string }>) {
    const link = await prisma.paymentLink.findFirst({ where: { id, merchantId } });
    if (!link) return null;
    const updated = await prisma.paymentLink.update({
      where: { id },
      data: {
        ...(body.title && { title: body.title }),
        ...(body.amount !== undefined && { amount: body.amount }),
        ...(body.currency && { currency: body.currency.toUpperCase() }),
        ...(body.expiresAt !== undefined && { expiresAt: body.expiresAt ? new Date(body.expiresAt) : null }),
      },
      select: linkSelect,
    });
    return { ...updated, amount: toNumNull(updated.amount) };
  },

  async delete(merchantId: string, id: string) {
    const link = await prisma.paymentLink.findFirst({ where: { id, merchantId } });
    if (!link) return null;
    const updated = await prisma.paymentLink.update({
      where: { id }, data: { status: "DISABLED" }, select: linkSelect,
    });
    return { ...updated, amount: toNumNull(updated.amount) };
  },
};
