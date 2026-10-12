import { Router } from 'express';
import {
  getLeaveTypes,
  getLeaveBalances,
  getLeaveRequests,
  submitLeaveRequest,
  reviewLeaveRequest,
} from './leave.controller.js';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';

const router = Router();

router.use(authenticate);

router.get('/types', getLeaveTypes);
router.get('/balances', getLeaveBalances);
router.get('/requests', getLeaveRequests);
router.post('/requests', submitLeaveRequest);
router.patch('/requests/:id/review', requireRole(['HR_DIRECTOR', 'HR_MANAGER', 'DEPT_MANAGER']), reviewLeaveRequest);

export default router;
