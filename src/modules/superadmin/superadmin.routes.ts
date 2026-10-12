import { Router } from 'express';
import {
  getPlatformOverview,
  getCompanies,
  getCompanyDetails,
  updateCompanyStatus,
  updateCompanySubscription,
  getPlatformAuditLogs,
} from './superadmin.controller.js';
import { authenticate } from '../../middleware/auth.js';
import { requireSuperAdmin } from '../../middleware/rbac.js';

const router = Router();

// Strict platform super administrator security boundary
router.use(authenticate);
router.use(requireSuperAdmin);

// Dashboard metrics & platform overview
router.get('/overview', getPlatformOverview);

// Company management
router.get('/companies', getCompanies);
router.get('/companies/:id', getCompanyDetails);
router.patch('/companies/:id/status', updateCompanyStatus);
router.patch('/companies/:id/subscription', updateCompanySubscription);

// Global platform audit trail
router.get('/audit-logs', getPlatformAuditLogs);

export default router;
