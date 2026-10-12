import { Router } from 'express';
import {
  getAttendanceRecords,
  getTodayAttendance,
  clockIn,
  clockOut,
  requestCorrection,
  getCorrections,
  reviewCorrection,
  requestOvertime,
  getOvertimeRequests,
  reviewOvertimeRequest,
} from './attendance.controller.js';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';

const router = Router();

router.use(authenticate);

router.get('/', getAttendanceRecords);
router.get('/today', getTodayAttendance);
router.post('/clock-in', clockIn);
router.post('/clock-out', clockOut);
router.post('/corrections', requestCorrection);
router.get('/corrections', getCorrections);
router.patch('/corrections/:id/review', requireRole(['HR_DIRECTOR', 'HR_MANAGER', 'DEPT_MANAGER']), reviewCorrection);

// Overtime Management Workflow
router.post('/overtime', requestOvertime);
router.get('/overtime', getOvertimeRequests);
router.patch('/overtime/:id/review', requireRole(['HR_DIRECTOR', 'HR_MANAGER', 'DEPT_MANAGER', 'ORG_ADMIN']), reviewOvertimeRequest);

export default router;
