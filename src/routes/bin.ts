import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { lookupBin, getLookupHistory, getBinStats, addBinRecord } from '../controllers/binController';

const router = Router();

router.use(authenticateToken as any);

router.post('/lookup',   lookupBin        as any);
router.get('/history',   getLookupHistory  as any);
router.get('/stats',     getBinStats       as any);
router.post('/records',  addBinRecord      as any);

export default router;
