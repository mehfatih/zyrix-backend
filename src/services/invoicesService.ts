// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Invoices Service
// ─────────────────────────────────────────────────────────────

import { prisma } from "../config/database";
import { Decimal } from "@prisma/client/runtime/library";

function toNum(d: Decimal | null | undefined): number {
  return parseFloat((d ?? 0).toString());
}

function genInvoiceId(): string {
  const rand = Math.floor(10000 + Math.random() * 90000);
  return `INV-${rand}`;
}

const invoiceSelect = {
  id: true,
  invoiceId: true,
  customerName: true,
  total: true,
  currency: true,
  status: true,
  items: true,
  dueDate: true,
  paidDate: true,
  createdAt: true,
};

export const invoicesService = {
  async list(merchantId: string, pagination: { skip: number; limit: number }) {
    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where: { merchantId },
        select: invoiceSelect,
        orderBy: { createdAt: "desc" },
        skip: pagination.skip,
        take: pagination.limit,
      }),
      prisma.invoice.count({ where: { merchantId } }),
    ]);
    return {
      data: invoices.map((i) => ({ ...i, total: toNum(i.total) })),
      total,
    };
  },

  async create(
    merchantId: string,
    body: {
      customerName: string;
      total: number;
      currency: string;
      items: unknown[];
      dueDate: string;
    }
  ) {
    const inv = await prisma.invoice.create({
      data: {
        merchantId,
        invoiceId: genInvoiceId(),
        customerName: body.customerName,
        total: body.total,
        currency: body.currency.toUpperCase(),
        status: "DRAFT",
        items: body.items as never,
        dueDate: new Date(body.dueDate),
      },
      select: invoiceSelect,
    });
    return { ...inv, total: toNum(inv.total) };
  },

  async getById(merchantId: string, id: string) {
    const inv = await prisma.invoice.findFirst({
      where: { id, merchantId },
      select: invoiceSelect,
    });
    if (!inv) return null;
    return { ...inv, total: toNum(inv.total) };
  },

  async update(
    merchantId: string,
    id: string,
    body: Partial<{
      customerName: string;
      total: number;
      currency: string;
      items: unknown[];
      dueDate: string;
    }>
  ) {
    const inv = await prisma.invoice.findFirst({ where: { id, merchantId } });
    if (!inv) return null;

    const updated = await prisma.invoice.update({
      where: { id },
      data: {
        ...(body.customerName && { customerName: body.customerName }),
        ...(body.total !== undefined && { total: body.total }),
        ...(body.currency && { currency: body.currency.toUpperCase() }),
        ...(body.items && { items: body.items as never }),
        ...(body.dueDate && { dueDate: new Date(body.dueDate) }),
      },
      select: invoiceSelect,
    });
    return { ...updated, total: toNum(updated.total) };
  },

  async delete(merchantId: string, id: string) {
    const inv = await prisma.invoice.findFirst({ where: { id, merchantId } });
    if (!inv) return null;

    const updated = await prisma.invoice.update({
      where: { id },
      data: { status: "CANCELLED" },
      select: invoiceSelect,
    });
    return { ...updated, total: toNum(updated.total) };
  },

  async send(merchantId: string, id: string) {
    const inv = await prisma.invoice.findFirst({ where: { id, merchantId } });
    if (!inv) return null;

    const updated = await prisma.invoice.update({
      where: { id },
      data: { status: "SENT" },
      select: invoiceSelect,
    });
    return { ...updated, total: toNum(updated.total) };
  },
};
