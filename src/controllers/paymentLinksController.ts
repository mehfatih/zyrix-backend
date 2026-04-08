// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Payment Links Controller
// ─────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types";
import { paymentLinksService } from "../services/paymentLinksService";
import { parsePagination, buildMeta } from "../utils/pagination";

export const paymentLinksController = {

  // Merchant: list own links (auth required)
  async list(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const pagination = parsePagination(req.query.page as string, req.query.limit as string);
      const { data, total } = await paymentLinksService.list(req.merchant.id, pagination);
      res.json({ success: true, data, meta: buildMeta(pagination.page, pagination.limit, total) });
    } catch (err) { next(err); }
  },

  // Merchant: create link (auth required)
  async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { title, amount, minAmount, maxAmount, currency, description, expiresAt, features, faqs, allowNote, showQr } = req.body;
      if (!title || !currency) {
        res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "title and currency are required" } });
        return;
      }
      if (amount === undefined && minAmount === undefined) {
        res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "amount or minAmount is required" } });
        return;
      }
      const link = await paymentLinksService.create(req.merchant.id, {
        title, amount, minAmount, maxAmount, currency, description, expiresAt, features, faqs, allowNote, showQr,
      });
      res.status(201).json({ success: true, data: link });
    } catch (err) { next(err); }
  },

  // Public: get link for landing page (NO auth)
  async getPublic(req: Request, res: Response, next: NextFunction) {
    try {
      const link = await paymentLinksService.getPublic(req.params.linkId);
      if (!link) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Payment link not found" } });
        return;
      }
      res.json({ success: true, data: link });
    } catch (err) { next(err); }
  },

  // Public: submit payment (NO auth)
  async pay(req: Request, res: Response, next: NextFunction) {
    try {
      const { amount, payerName, payerPhone, payerNote, utmSource, utmMedium, utmCampaign } = req.body;
      if (!payerName || !payerPhone || amount === undefined) {
        res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "amount, payerName, payerPhone are required" } });
        return;
      }
      const result = await paymentLinksService.recordPayment(req.params.linkId, {
        amount, payerName, payerPhone, payerNote, utmSource, utmMedium, utmCampaign,
      });
      if (!result) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Payment link not found" } });
        return;
      }
      if ("error" in result) {
        res.status(400).json({ success: false, error: { code: result.error, message: result.error } });
        return;
      }
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  },

  // Merchant: update link (auth required)
  async update(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const updated = await paymentLinksService.update(req.merchant.id, req.params.id, req.body);
      if (!updated) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Payment link not found" } });
        return;
      }
      res.json({ success: true, data: updated });
    } catch (err) { next(err); }
  },

  // Merchant: delete/disable link (auth required)
  async delete(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await paymentLinksService.delete(req.merchant.id, req.params.id);
      if (!result) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Payment link not found" } });
        return;
      }
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  },
};
