// src/routes/customers.ts
import { Router } from "express";
import { authenticateToken } from "../middleware/auth";
import {
  listCustomers,
  getCustomer,
  upsertCustomer,
  updateCustomer,
  getCustomersSummary,
} from "../controllers/customersController";

const router = Router();

router.use(authenticateToken as any);

router.get("/summary",      getCustomersSummary    as any);
router.get("/",             listCustomers          as any);
router.get("/:customerId",  getCustomer            as any);
router.post("/",            upsertCustomer         as any);
router.put("/:customerId",  updateCustomer         as any);

export default router;
