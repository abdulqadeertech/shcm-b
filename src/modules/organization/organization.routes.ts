import { Router } from 'express';
import {
  getCurrentOrg,
  updateCurrentOrg,
  getDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  getDesignations,
  createDesignation,
  updateDesignation,
  deleteDesignation,
  getBranches,
  createBranch,
  updateBranch,
  deleteBranch,
  getShifts,
  createShift,
  updateShift,
  deleteShift,
} from './organization.controller.js';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';

const router = Router();

router.use(authenticate);

router.get('/current', getCurrentOrg);
router.patch('/current', requireRole(['PLATFORM_SUPER_ADMIN', 'ORG_ADMIN', 'HR_DIRECTOR', 'HR_MANAGER']), updateCurrentOrg);

router.get('/departments', getDepartments);
router.post('/departments', requireRole(['HR_DIRECTOR', 'HR_MANAGER', 'ORG_ADMIN']), createDepartment);
router.patch('/departments/:id', requireRole(['HR_DIRECTOR', 'HR_MANAGER', 'ORG_ADMIN']), updateDepartment);
router.delete('/departments/:id', requireRole(['HR_DIRECTOR', 'HR_MANAGER', 'ORG_ADMIN']), deleteDepartment);

router.get('/designations', getDesignations);
router.post('/designations', requireRole(['HR_DIRECTOR', 'HR_MANAGER', 'ORG_ADMIN']), createDesignation);
router.patch('/designations/:id', requireRole(['HR_DIRECTOR', 'HR_MANAGER', 'ORG_ADMIN']), updateDesignation);
router.delete('/designations/:id', requireRole(['HR_DIRECTOR', 'HR_MANAGER', 'ORG_ADMIN']), deleteDesignation);

router.get('/branches', getBranches);
router.post('/branches', requireRole(['HR_DIRECTOR', 'HR_MANAGER', 'ORG_ADMIN']), createBranch);
router.patch('/branches/:id', requireRole(['HR_DIRECTOR', 'HR_MANAGER', 'ORG_ADMIN']), updateBranch);
router.delete('/branches/:id', requireRole(['HR_DIRECTOR', 'ORG_ADMIN']), deleteBranch);

router.get('/shifts', getShifts);
router.post('/shifts', requireRole(['HR_DIRECTOR', 'HR_MANAGER', 'ORG_ADMIN']), createShift);
router.patch('/shifts/:id', requireRole(['HR_DIRECTOR', 'HR_MANAGER', 'ORG_ADMIN']), updateShift);
router.delete('/shifts/:id', requireRole(['HR_DIRECTOR', 'HR_MANAGER', 'ORG_ADMIN']), deleteShift);

export default router;
