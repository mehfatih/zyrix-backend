import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import {
  retryTransaction,
  getRetryLogs,
  getFailedTransactions,
} from "../controllers/retryController";

const router = Router();

router.use(authenticate);

router.get("/failed", getFailedTransactions);
router.post("/:transactionId", retryTransaction);
router.get("/:transactionId/logs", getRetryLogs);

export default router;
