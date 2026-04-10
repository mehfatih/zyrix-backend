import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { listGateways, createGateway, updateGateway, deleteGateway, getConfig, updateConfig, listRules, createRule, updateRule, deleteRule, getAnalytics, routeTransaction, recordEvent, aiRouteTransaction, getAiInsights, getFallbackChain } from '../controllers/gatewayRoutingController';

const router = Router();
router.use(authenticate);

router.get('/gateways',          listGateways);
router.post('/gateways',         createGateway);
router.patch('/gateways/:id',    updateGateway);
router.delete('/gateways/:id',   deleteGateway);
router.get('/config',            getConfig);
router.patch('/config',          updateConfig);
router.get('/rules',             listRules);
router.post('/rules',            createRule);
router.patch('/rules/:id',       updateRule);
router.delete('/rules/:id',      deleteRule);
router.get('/analytics',         getAnalytics);
router.post('/route',            routeTransaction);
router.post('/events',           recordEvent);

// ── ELITE #11 ──────────────────────────────────────
router.post('/ai-route',         aiRouteTransaction);
router.get('/ai-insights',       getAiInsights);
router.get('/fallback-chain',    getFallbackChain);

export default router;
