import { Router } from 'express';
import {
  getJobRequisitions,
  createJobRequisition,
  getCandidates,
  createCandidate,
  updateCandidateStage,
} from './recruitment.controller.js';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';

const router = Router();

router.use(authenticate);

router.get('/jobs', getJobRequisitions);
router.post('/jobs', requireRole(['HR_DIRECTOR', 'HR_MANAGER', 'RECRUITER']), createJobRequisition);
router.get('/candidates', getCandidates);
router.post('/candidates', requireRole(['HR_DIRECTOR', 'HR_MANAGER', 'RECRUITER']), createCandidate);
router.patch('/candidates/:id/stage', requireRole(['HR_DIRECTOR', 'HR_MANAGER', 'RECRUITER']), updateCandidateStage);

export default router;
