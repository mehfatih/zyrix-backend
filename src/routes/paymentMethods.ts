// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Payment Methods Routes
// ─────────────────────────────────────────────────────────────
import { Router } from "express";
import { authenticateToken } from "../middleware/auth";
import {
  listMethods,
  updateMethod,
  toggleMethod,
  getMethodsPublic,
} from "../controllers/paymentMethodsController";

const router = Router();

// Merchant routes
router.get("/",                   authenticateToken, listMethods);
router.put("/:method",            authenticateToken, updateMethod);
router.patch("/:method/toggle",   authenticateToken, toggleMethod);

// Public route — for Hosted Checkout page
router.get("/public/:merchantId", getMethodsPublic);

export default router;
