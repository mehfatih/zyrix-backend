import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  listGateways, createGateway, updateGateway, deleteGateway,
  getConfig, updateConfig,
  listRules, createRule, updateRule, deleteRule,
  getAnalytics, routeTransaction, recordEvent,
} from '../controllers/gatewayRoutingController';

const router = Router();

router.use(authenticateToken as any);

// Gateways
router.get('/gateways',          listGateways    as any);
router.post('/gateways',         createGateway   as any);
router.patch('/gateways/:id',    updateGateway   as any);
router.delete('/gateways/:id',   deleteGateway   as any);

// Config
router.get('/config',            getConfig       as any);
router.patch('/config',          updateConfig    as any);

// Rules
router.get('/rules',             listRules       as any);
router.post('/rules',            createRule      as any);
router.patch('/rules/:id',       updateRule      as any);
router.delete('/rules/:id',      deleteRule      as any);

// Core engine + analytics
router.post('/route',            routeTransaction as any);
router.post('/events',           recordEvent     as any);
router.get('/analytics',         getAnalytics    as any);

export default router;
