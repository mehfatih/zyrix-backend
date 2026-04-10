import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  getReminders, createReminder, sendReminder, deleteReminder,
  getRecoveryOpportunities, retryRecovery,
  getCRMCustomers, updateCRMCustomer, exportCRM,
  getAffiliates, createAffiliate, getAffiliateStats, updateAffiliate, deleteAffiliate,
  getPermissions, checkPermission,
  getMarketplaceConfig, createVendor,
  calculateSplit, getSplitRules, createSplitRule,
} from '../controllers/growthController';

const router = Router();

// 32 — Payment Reminders
router.get   ('/reminders',           authenticateToken, getReminders    as any);
router.post  ('/reminders',           authenticateToken, createReminder  as any);
router.post  ('/reminders/:id/send',  authenticateToken, sendReminder    as any);
router.delete('/reminders/:id',       authenticateToken, deleteReminder  as any);

// 33 — Revenue Recovery
router.get   ('/recovery',            authenticateToken, getRecoveryOpportunities as any);
router.post  ('/recovery/retry/:txId',authenticateToken, retryRecovery           as any);

// 34 — CRM
router.get   ('/crm/customers',       authenticateToken, getCRMCustomers    as any);
router.patch ('/crm/customers/:id',   authenticateToken, updateCRMCustomer  as any);
router.post  ('/crm/export',          authenticateToken, exportCRM          as any);

// 36 — Affiliates
router.get   ('/affiliates',          authenticateToken, getAffiliates      as any);
router.post  ('/affiliates',          authenticateToken, createAffiliate    as any);
router.get   ('/affiliates/:id/stats',authenticateToken, getAffiliateStats  as any);
router.patch ('/affiliates/:id',      authenticateToken, updateAffiliate    as any);
router.delete('/affiliates/:id',      authenticateToken, deleteAffiliate    as any);

// 37+38 — Team Permissions
router.get   ('/permissions',         authenticateToken, getPermissions    as any);
router.post  ('/permissions/check',   authenticateToken, checkPermission   as any);

// 39 — Marketplace
router.get   ('/marketplace',         authenticateToken, getMarketplaceConfig as any);
router.post  ('/marketplace/vendor',  authenticateToken, createVendor        as any);

// 40 — Split Payments
router.post  ('/split/calculate',     authenticateToken, calculateSplit   as any);
router.get   ('/split/rules',         authenticateToken, getSplitRules    as any);
router.post  ('/split/rules',         authenticateToken, createSplitRule  as any);

export default router;
