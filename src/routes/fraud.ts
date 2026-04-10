import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { analyzeTransaction, listEvents, reviewEvent, listRules, createRule, updateRule, deleteRule, getStats, mlScore, checkDeviceFingerprint } from '../controllers/fraudController';

const router = Router();
router.use(authenticate);

router.post('/analyze',          analyzeTransaction);
router.get('/events',            listEvents);
router.patch('/events/:id/review', reviewEvent);
router.get('/rules',             listRules);
router.post('/rules',            createRule);
router.patch('/rules/:id',       updateRule);
router.delete('/rules/:id',      deleteRule);
router.get('/stats',             getStats);

// ── ELITE #16 ──────────────────────────────────────
router.post('/ml-score',         mlScore);
router.post('/device-fingerprint', checkDeviceFingerprint);

export default router;
