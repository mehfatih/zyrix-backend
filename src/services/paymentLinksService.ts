// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Payment Links Service
// ─────────────────────────────────────────────────────────────

import { prisma } from "../config/database";
import { Decimal } from "@prisma/client/runtime/library";
import { env } from "../config/env";

function toNum(d: Decimal | null | undefined): number {
  return parseFloat((d ?? 0).toString());
}

function genLinkId(): string {
  const rand = Math.floor(10000 + Math.random() * 90000);
  return `PL-${rand}`;
}

const linkSelect = {
  id: true,
  linkId: true,
  title: true,
  amount: true,
  currency: true,
  url: true,
  status: true,
  expiresAt: true,
  usageCount: true,
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
      data: links.map((l) => ({ ...l, amount: toNum(l.amount) })),
      total,
    };
  },

  async create(
    merchantId: string,
    body: { title: string; amount: number; currency: string; expiresAt?: string }
  ) {
    const linkId = genLinkId();
    const baseUrl = (env as unknown as Record<string, string>).appUrl ?? "https://pay.zyrix.io";
    const url = `${baseUrl}/pay/${linkId}`;

    const link = await prisma.paymentLink.create({
      data: {
        merchantId,
        linkId,
        title: body.title,
        amount: body.amount,
        currency: body.currency.toUpperCase(),
        url,
        status: "ACTIVE",
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      },
      select: linkSelect,
    });
    return { ...link, amount: toNum(link.amount) };
  },

  async update(
    merchantId: string,
    id: string,
    body: Partial<{ title: string; amount: number; currency: string; expiresAt: string }>
  ) {
    const link = await prisma.paymentLink.findFirst({ where: { id, merchantId } });
    if (!link) return null;

    const updated = await prisma.paymentLink.update({
      where: { id },
      data: {
        ...(body.title && { title: body.title }),
        ...(body.amount !== undefined && { amount: body.amount }),
        ...(body.currency && { currency: body.currency.toUpperCase() }),
        ...(body.expiresAt !== undefined && {
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        }),
      },
      select: linkSelect,
    });
    return { ...updated, amount: toNum(updated.amount) };
  },

  async delete(merchantId: string, id: string) {
    const link = await prisma.paymentLink.findFirst({ where: { id, merchantId } });
    if (!link) return null;

    const updated = await prisma.paymentLink.update({
      where: { id },
      data: { status: "DISABLED" },
      select: linkSelect,
    });
    return { ...updated, amount: toNum(updated.amount) };
  },
};
