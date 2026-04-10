import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  getDashboard,
  getConversionFunnel,
  getSuccessRate,
  getCustomerAnalytics,
  getSmartInsights,
  getForecast,
  getAlerts,
  createAlert,
  updateAlert,
  deleteAlert,
  checkAlerts,
} from '../controllers/analyticsIntelligenceController';

const router = Router();

router.get('/dashboard',     authenticateToken, getDashboard     as any);
router.get('/funnel',        authenticateToken, getConversionFunnel as any);
router.get('/success-rate',  authenticateToken, getSuccessRate   as any);
router.get('/customers',     authenticateToken, getCustomerAnalytics as any);
router.get('/insights',      authenticateToken, getSmartInsights as any);
router.get('/forecast',      authenticateToken, getForecast      as any);

router.get   ('/alerts',      authenticateToken, getAlerts   as any);
router.post  ('/alerts',      authenticateToken, createAlert as any);
router.put   ('/alerts/:id',  authenticateToken, updateAlert as any);
router.delete('/alerts/:id',  authenticateToken, deleteAlert as any);
router.post  ('/alerts/check',authenticateToken, checkAlerts as any);

export default router;
