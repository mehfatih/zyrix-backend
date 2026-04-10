import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { lookupBin, getLookupHistory, getBinStats, addBinRecord, get3dsDecision, getCountry3dsRules } from '../controllers/binController';

const router = Router();
router.use(authenticateToken);

router.post('/lookup',           lookupBin);
router.get('/history',           getLookupHistory);
router.get('/stats',             getBinStats);
router.post('/records',          addBinRecord);
router.post('/3ds-decision',     get3dsDecision);
router.get('/country-3ds-rules', getCountry3dsRules);

export default router;
