import { Router } from 'express';
import {
  getPayrollRuns,
  getPayrollRunById,
  getPayrollPrecheck,
  processPayrollRun,
  simulatePayrollRun,
  updatePayrollRunStatus,
  finalizePayrollRun,
  getMyPayslips,
  getSalaryHistory,
  recordSalaryRevision,
  getCountryPolicies,
  saveCountryPolicy,
  exportPayrollRunCsv,
} from './payroll.controller.js';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';

const router = Router();

router.use(authenticate);

router.get('/my-payslips', getMyPayslips);
router.get('/precheck', requireRole(['HR_DIRECTOR', 'HR_MANAGER', 'PAYROLL_MANAGER', 'PLATFORM_SUPER_ADMIN', 'ORG_ADMIN']), getPayrollPrecheck);

router.get('/runs', requireRole(['HR_DIRECTOR', 'HR_MANAGER', 'PAYROLL_MANAGER', 'PLATFORM_SUPER_ADMIN', 'ORG_ADMIN']), getPayrollRuns);
router.get('/runs/:id', requireRole(['HR_DIRECTOR', 'HR_MANAGER', 'PAYROLL_MANAGER', 'PLATFORM_SUPER_ADMIN', 'ORG_ADMIN']), getPayrollRunById);
router.post('/runs', requireRole(['HR_DIRECTOR', 'PAYROLL_MANAGER', 'PLATFORM_SUPER_ADMIN']), processPayrollRun);
router.post('/simulate', requireRole(['HR_DIRECTOR', 'HR_MANAGER', 'PAYROLL_MANAGER', 'PLATFORM_SUPER_ADMIN']), simulatePayrollRun);
router.patch('/runs/:id/status', requireRole(['HR_DIRECTOR', 'PAYROLL_MANAGER', 'PLATFORM_SUPER_ADMIN']), updatePayrollRunStatus);
router.post('/runs/:id/finalize', requireRole(['HR_DIRECTOR', 'PAYROLL_MANAGER', 'PLATFORM_SUPER_ADMIN']), finalizePayrollRun);
router.get('/export/:id', requireRole(['HR_DIRECTOR', 'PAYROLL_MANAGER', 'PLATFORM_SUPER_ADMIN']), exportPayrollRunCsv);

router.get('/salary-history/:employeeId', requireRole(['HR_DIRECTOR', 'HR_MANAGER', 'PAYROLL_MANAGER', 'PLATFORM_SUPER_ADMIN']), getSalaryHistory);
router.post('/salary-history', requireRole(['HR_DIRECTOR', 'HR_MANAGER', 'PAYROLL_MANAGER', 'PLATFORM_SUPER_ADMIN']), recordSalaryRevision);

router.get('/country-policies', getCountryPolicies);
router.post('/country-policies', requireRole(['HR_DIRECTOR', 'PAYROLL_MANAGER', 'PLATFORM_SUPER_ADMIN']), saveCountryPolicy);

export default router;
