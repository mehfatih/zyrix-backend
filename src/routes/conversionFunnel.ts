import { Router } from "express";
import { authenticate } from "../middleware/auth";
import {
  trackEvent,
  getFunnelOverview,
  getFunnelByChannel,
  getFunnelByCountry,
  getFunnelByDevice,
  getDropAnalysis,
} from "../controllers/conversionFunnelController";

const router = Router();

router.post("/event",       authenticate, trackEvent);
router.get( "/overview",    authenticate, getFunnelOverview);
router.get( "/by-channel",  authenticate, getFunnelByChannel);
router.get( "/by-country",  authenticate, getFunnelByCountry);
router.get( "/by-device",   authenticate, getFunnelByDevice);
router.get( "/drop-analysis", authenticate, getDropAnalysis);

export default router;
