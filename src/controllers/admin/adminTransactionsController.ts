import { Response, NextFunction } from "express";
import { AdminRequest } from "../../middleware/adminAuth";
import { adminTransactionsService } from "../../services/admin/adminTransactionsService";
import { parsePagination, buildMeta } from "../../utils/pagination";

export const adminTransactionsController = {
  async list(req: AdminRequest, res: Response, next: NextFunction) {
    try {
      const pagination = parsePagination(req.query.page as string, req.query.limit as string);
      const { data, total } = await adminTransactionsService.list(pagination, req.query as Record<string, unknown>);
      res.json({ success: true, data, meta: buildMeta(pagination.page, pagination.limit, total) });
    } catch (err) { next(err); }
  },
};
