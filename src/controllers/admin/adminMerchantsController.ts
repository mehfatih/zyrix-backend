import { Response, NextFunction } from "express";
import { AdminRequest } from "../../middleware/adminAuth";
import { adminMerchantsService } from "../../services/admin/adminMerchantsService";
import { parsePagination, buildMeta } from "../../utils/pagination";
import { MerchantStatus } from "@prisma/client";

export const adminMerchantsController = {
  async list(req: AdminRequest, res: Response, next: NextFunction) {
    try {
      const pagination = parsePagination(req.query.page as string, req.query.limit as string);
      const { data, total } = await adminMerchantsService.list(pagination, req.query.search as string);
      res.json({ success: true, data, meta: buildMeta(pagination.page, pagination.limit, total) });
    } catch (err) { next(err); }
  },

  async getById(req: AdminRequest, res: Response, next: NextFunction) {
    try {
      const merchant = await adminMerchantsService.getById(req.params.id);
      if (!merchant) { res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Merchant not found" } }); return; }
      res.json({ success: true, data: merchant });
    } catch (err) { next(err); }
  },

  async updateStatus(req: AdminRequest, res: Response, next: NextFunction) {
    try {
      const { status } = req.body;
      if (!["ACTIVE", "SUSPENDED", "PENDING_KYC"].includes(status)) {
        res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Invalid status" } });
        return;
      }
      const merchant = await adminMerchantsService.updateStatus(req.params.id, status as MerchantStatus);
      res.json({ success: true, data: merchant });
    } catch (err) { next(err); }
  },
};
