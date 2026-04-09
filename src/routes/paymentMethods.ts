import { Router } from "express";
import { authenticate } from "../middleware/auth";
import {
  listMethods,
  updateMethod,
  toggleMethod,
  getMethodsPublic,
} from "../controllers/paymentMethodsController";

const router = Router();

// Merchant routes
router.get("/",            authenticate, listMethods);
router.put("/:method",     authenticate, updateMethod);
router.patch("/:method/toggle", authenticate, toggleMethod);

// Public route — for Hosted Checkout page
router.get("/public/:merchantId", getMethodsPublic);

export default router;
