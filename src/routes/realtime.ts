import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { streamEvents, getEventHistory } from "../controllers/realtimeController";

const router = Router();

router.use(authenticate);

router.get("/events", streamEvents);
router.get("/history", getEventHistory);

export default router;
