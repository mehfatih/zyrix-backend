// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Filter Utilities
// ─────────────────────────────────────────────────────────────

import { TransactionStatus, PaymentMethod } from "@prisma/client";

export interface TransactionFilters {
  status?: TransactionStatus;
  method?: PaymentMethod;
  from?: Date;
  to?: Date;
  search?: string;
}

export function parseTransactionFilters(query: Record<string, unknown>): TransactionFilters {
  const filters: TransactionFilters = {};

  if (query.status && typeof query.status === "string") {
    const upper = query.status.toUpperCase() as TransactionStatus;
    if (["SUCCESS", "PENDING", "FAILED"].includes(upper)) {
      filters.status = upper;
    }
  }

  if (query.method && typeof query.method === "string") {
    const upper = query.method.toUpperCase() as PaymentMethod;
    if (["CREDIT_CARD", "BANK_TRANSFER", "DIGITAL_WALLET", "CRYPTO"].includes(upper)) {
      filters.method = upper;
    }
  }

  if (query.from && typeof query.from === "string") {
    const d = new Date(query.from);
    if (!isNaN(d.getTime())) filters.from = d;
  }

  if (query.to && typeof query.to === "string") {
    const d = new Date(query.to);
    if (!isNaN(d.getTime())) {
      d.setHours(23, 59, 59, 999);
      filters.to = d;
    }
  }

  if (query.search && typeof query.search === "string") {
    filters.search = query.search.trim();
  }

  return filters;
}

export function parsePeriod(period?: string): { start: Date; labels: string[] } {
  const now = new Date();
  const days =
    period === "30d" ? 30 :
    period === "90d" ? 90 :
    period === "1y" ? 365 : 7;

  const start = new Date(now);
  start.setDate(start.getDate() - days);
  start.setHours(0, 0, 0, 0);

  const labels: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    if (days <= 7) {
      labels.push(d.toLocaleDateString("en-US", { weekday: "short" }));
    } else if (days <= 30) {
      labels.push(d.toLocaleDateString("en-US", { month: "short", day: "numeric" }));
    } else if (days <= 90) {
      // Weekly labels
      if (i % 7 === 0) {
        labels.push(d.toLocaleDateString("en-US", { month: "short", day: "numeric" }));
      }
    } else {
      // Monthly labels
      if (i % 30 === 0) {
        labels.push(d.toLocaleDateString("en-US", { month: "short" }));
      }
    }
  }

  return { start, labels };
}
