import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { lookupBin, getLookupHistory, getBinStats, addBinRecord, get3dsDecision, getCountry3dsRules } from '../controllers/binController';

const router = Router();
router.use(authenticate);

router.post('/lookup',           lookupBin);
router.get('/history',           getLookupHistory);
router.get('/stats',             getBinStats);
router.post('/records',          addBinRecord);

// ── ELITE #13 ──────────────────────────────────────
router.post('/3ds-decision',     get3dsDecision);
router.get('/country-3ds-rules', getCountry3dsRules);

export default router;
