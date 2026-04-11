import { Router } from "express";
import { authenticate } from "../middleware/auth";
import {
  getCLVOverview,
  getSegments,
  getCohorts,
  getTopCustomers,
  predictCLV,
} from "../controllers/customerCLVController";

const router = Router();

router.get("/overview",        authenticate, getCLVOverview);
router.get("/segments",        authenticate, getSegments);
router.get("/cohorts",         authenticate, getCohorts);
router.get("/top",             authenticate, getTopCustomers);
router.get("/predict/:customerId", authenticate, predictCLV);

export default router;
