import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import {
  generateReconciliation,
  listReconciliations,
  getReconciliation,
} from "../controllers/reconciliationController";

const router = Router();

router.use(authenticate);

router.post("/", generateReconciliation);
router.get("/", listReconciliations);
router.get("/:reportId", getReconciliation);

export default router;
