import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { listGateways, createGateway, updateGateway, deleteGateway, getConfig, updateConfig, listRules, createRule, updateRule, deleteRule, getAnalytics, routeTransaction, recordEvent, aiRouteTransaction, getAiInsights, getFallbackChain } from '../controllers/gatewayRoutingController';
import { AuthenticatedRequest } from '../types';

const router = Router();
router.use(authenticateToken);

router.get('/gateways',        (req: Request, res: Response) => listGateways(req as AuthenticatedRequest, res));
router.post('/gateways',       (req: Request, res: Response) => createGateway(req as AuthenticatedRequest, res));
router.patch('/gateways/:id',  (req: Request, res: Response) => updateGateway(req as AuthenticatedRequest, res));
router.delete('/gateways/:id', (req: Request, res: Response) => deleteGateway(req as AuthenticatedRequest, res));
router.get('/config',          (req: Request, res: Response) => getConfig(req as AuthenticatedRequest, res));
router.patch('/config',        (req: Request, res: Response) => updateConfig(req as AuthenticatedRequest, res));
router.get('/rules',           (req: Request, res: Response) => listRules(req as AuthenticatedRequest, res));
router.post('/rules',          (req: Request, res: Response) => createRule(req as AuthenticatedRequest, res));
router.patch('/rules/:id',     (req: Request, res: Response) => updateRule(req as AuthenticatedRequest, res));
router.delete('/rules/:id',    (req: Request, res: Response) => deleteRule(req as AuthenticatedRequest, res));
router.get('/analytics',       (req: Request, res: Response) => getAnalytics(req as AuthenticatedRequest, res));
router.post('/route',          (req: Request, res: Response) => routeTransaction(req as AuthenticatedRequest, res));
router.post('/events',         (req: Request, res: Response) => recordEvent(req as AuthenticatedRequest, res));
router.post('/ai-route',       (req: Request, res: Response) => aiRouteTransaction(req as AuthenticatedRequest, res));
router.get('/ai-insights',     (req: Request, res: Response) => getAiInsights(req as AuthenticatedRequest, res));
router.get('/fallback-chain',  (req: Request, res: Response) => getFallbackChain(req as AuthenticatedRequest, res));

export default router;
