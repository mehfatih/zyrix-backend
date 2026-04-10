import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { analyzeTransaction, listEvents, reviewEvent, listRules, createRule, updateRule, deleteRule, getStats } from '../controllers/fraudController';

const router = Router();

router.use(authenticateToken as any);

router.post('/analyze',         analyzeTransaction as any);
router.get('/events',           listEvents         as any);
router.patch('/events/:id/review', reviewEvent     as any);
router.get('/rules',            listRules          as any);
router.post('/rules',           createRule         as any);
router.patch('/rules/:id',      updateRule         as any);
router.delete('/rules/:id',     deleteRule         as any);
router.get('/stats',            getStats           as any);

export default router;
