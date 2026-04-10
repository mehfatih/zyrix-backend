import { Router, Request, Response, NextFunction } from 'express';
import { authenticateToken } from '../middleware/auth';
import { listGateways, createGateway, updateGateway, deleteGateway, getConfig, updateConfig, listRules, createRule, updateRule, deleteRule, getAnalytics, routeTransaction, recordEvent, aiRouteTransaction, getAiInsights, getFallbackChain } from '../controllers/gatewayRoutingController';
import { AuthenticatedRequest } from '../types';

const router = Router();
router.use(authenticateToken);

router.get('/gateways',           (req: Request, res: Response, next: NextFunction) => listGateways(req as AuthenticatedRequest, res, next));
router.post('/gateways',          (req: Request, res: Response, next: NextFunction) => createGateway(req as AuthenticatedRequest, res, next));
router.patch('/gateways/:id',     (req: Request, res: Response, next: NextFunction) => updateGateway(req as AuthenticatedRequest, res, next));
router.delete('/gateways/:id',    (req: Request, res: Response, next: NextFunction) => deleteGateway(req as AuthenticatedRequest, res, next));
router.get('/config',             (req: Request, res: Response, next: NextFunction) => getConfig(req as AuthenticatedRequest, res, next));
router.patch('/config',           (req: Request, res: Response, next: NextFunction) => updateConfig(req as AuthenticatedRequest, res, next));
router.get('/rules',              (req: Request, res: Response, next: NextFunction) => listRules(req as AuthenticatedRequest, res, next));
router.post('/rules',             (req: Request, res: Response, next: NextFunction) => createRule(req as AuthenticatedRequest, res, next));
router.patch('/rules/:id',        (req: Request, res: Response, next: NextFunction) => updateRule(req as AuthenticatedRequest, res, next));
router.delete('/rules/:id',       (req: Request, res: Response, next: NextFunction) => deleteRule(req as AuthenticatedRequest, res, next));
router.get('/analytics',          (req: Request, res: Response, next: NextFunction) => getAnalytics(req as AuthenticatedRequest, res, next));
router.post('/route',             (req: Request, res: Response, next: NextFunction) => routeTransaction(req as AuthenticatedRequest, res, next));
router.post('/events',            (req: Request, res: Response, next: NextFunction) => recordEvent(req as AuthenticatedRequest, res, next));
router.post('/ai-route',          (req: Request, res: Response, next: NextFunction) => aiRouteTransaction(req as AuthenticatedRequest, res, next));
router.get('/ai-insights',        (req: Request, res: Response, next: NextFunction) => getAiInsights(req as AuthenticatedRequest, res, next));
router.get('/fallback-chain',     (req: Request, res: Response, next: NextFunction) => getFallbackChain(req as AuthenticatedRequest, res, next));

export default router;
