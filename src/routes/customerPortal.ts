import { Router, RequestHandler } from "express";
import {
  getProfile,
  getInvoices,
  getQuotes,
  respondToQuote,
  getLoyalty,
  getTransactions,
  validateToken,
} from "../controllers/customerPortal.controller";

const h = (fn: Function): RequestHandler => fn as RequestHandler;

const router = Router();

// Token validation (no auth header needed — used by frontend to check link validity)
router.get("/validate/:token",        h(validateToken));

// All routes below require x-portal-token header (set by frontend after token validation)
router.get("/profile",                h(getProfile));
router.get("/invoices",               h(getInvoices));
router.get("/quotes",                 h(getQuotes));
router.post("/quotes/:id/respond",    h(respondToQuote));
router.get("/loyalty",                h(getLoyalty));
router.get("/transactions",           h(getTransactions));

export default router;
