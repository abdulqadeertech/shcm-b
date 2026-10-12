import { Router } from 'express';
import {
  getEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  getEssSummary,
  getEmployeeChecklists,
  toggleChecklistItem,
  getEmployeeExpiries,
  getAnnouncements,
  createAnnouncement,
  getCompanyCalendar,
  importEmployees,
  getDocumentExpiries,
  addEmployeeDocument,
} from './employee.controller.js';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';

const router = Router();

router.use(authenticate);

// Specific routes before param :id
router.get('/ess/summary', getEssSummary);
router.get('/expiries', requireRole(['HR_DIRECTOR', 'HR_MANAGER', 'DEPT_MANAGER', 'ORG_ADMIN', 'PLATFORM_SUPER_ADMIN']), getEmployeeExpiries);
router.get('/documents/expiring', requireRole(['HR_DIRECTOR', 'HR_MANAGER', 'ORG_ADMIN', 'PLATFORM_SUPER_ADMIN', 'AUDITOR']), getDocumentExpiries);
router.get('/announcements', getAnnouncements);
router.post('/announcements', requireRole(['HR_DIRECTOR', 'HR_MANAGER', 'ORG_ADMIN']), createAnnouncement);
router.get('/company-calendar', getCompanyCalendar);

router.post('/import', requireRole(['HR_DIRECTOR', 'HR_MANAGER', 'ORG_ADMIN', 'PLATFORM_SUPER_ADMIN']), importEmployees);

router.get('/checklists/:employeeId', getEmployeeChecklists);
router.patch('/checklists/:itemId/toggle', toggleChecklistItem);

router.get('/', getEmployees);
router.get('/:id', getEmployeeById);
router.post('/', requireRole(['HR_DIRECTOR', 'HR_MANAGER', 'HR_OFFICER', 'ORG_ADMIN']), createEmployee);
router.patch('/:id', requireRole(['HR_DIRECTOR', 'HR_MANAGER', 'ORG_ADMIN']), updateEmployee);
router.delete('/:id', requireRole(['HR_DIRECTOR', 'HR_MANAGER', 'ORG_ADMIN', 'PLATFORM_SUPER_ADMIN']), deleteEmployee);
router.post('/:id/documents', requireRole(['HR_DIRECTOR', 'HR_MANAGER', 'ORG_ADMIN', 'PLATFORM_SUPER_ADMIN']), addEmployeeDocument);

export default router;
