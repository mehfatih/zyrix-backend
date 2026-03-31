// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Pagination Utility
// ─────────────────────────────────────────────────────────────

import { PaginationMeta } from "../types";

export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

export function parsePagination(
  pageStr?: string,
  limitStr?: string
): PaginationParams {
  const page = Math.max(1, parseInt(pageStr ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(limitStr ?? "20", 10) || 20));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

export function buildMeta(
  page: number,
  limit: number,
  total: number
): PaginationMeta {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}
