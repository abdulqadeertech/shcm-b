import { Router } from 'express';
import {
  createBackupSnapshot,
  restoreBackupSnapshot,
  getSecurityAuditSummary,
  getActionCenterSummary,
  getCompanyHrHealthCheck,
} from './system.controller.js';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';

const router = Router();

router.use(authenticate);

router.get('/action-center', getActionCenterSummary);
router.get('/health-check', requireRole(['PLATFORM_SUPER_ADMIN', 'ORG_ADMIN', 'HR_DIRECTOR', 'HR_MANAGER', 'AUDITOR']), getCompanyHrHealthCheck);

router.post('/backup', requireRole(['PLATFORM_SUPER_ADMIN', 'ORG_ADMIN', 'HR_DIRECTOR']), createBackupSnapshot);
router.post('/restore', requireRole(['PLATFORM_SUPER_ADMIN', 'ORG_ADMIN']), restoreBackupSnapshot);
router.get('/security-audit', requireRole(['PLATFORM_SUPER_ADMIN', 'ORG_ADMIN', 'HR_DIRECTOR', 'AUDITOR']), getSecurityAuditSummary);

export default router;
