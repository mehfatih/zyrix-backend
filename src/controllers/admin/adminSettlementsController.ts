import { Response, NextFunction } from "express";
import { AdminRequest } from "../../middleware/adminAuth";
import { adminSettlementsService } from "../../services/admin/adminSettlementsService";
import { parsePagination, buildMeta } from "../../utils/pagination";

export const adminSettlementsController = {
  async list(req: AdminRequest, res: Response, next: NextFunction) {
    try {
      const pagination = parsePagination(req.query.page as string, req.query.limit as string);
      const { data, total } = await adminSettlementsService.list(pagination, req.query.status as string);
      res.json({ success: true, data, meta: buildMeta(pagination.page, pagination.limit, total) });
    } catch (err) { next(err); }
  },
};
