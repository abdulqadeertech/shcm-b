import { Router } from 'express';
import {
  getWorkflows,
  upsertWorkflow,
  getApprovalRequests,
  submitApprovalRequest,
  actOnApprovalRequest,
  getDelegations,
  createDelegation,
  revokeDelegation,
} from './workflow.controller.js';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';

const router = Router();

router.use(authenticate);

router.get('/', getWorkflows);
router.post('/', requireRole(['PLATFORM_SUPER_ADMIN', 'ORG_ADMIN', 'HR_DIRECTOR']), upsertWorkflow);

router.get('/requests', getApprovalRequests);
router.post('/requests', submitApprovalRequest);
router.post('/requests/:id/act', actOnApprovalRequest);

router.get('/delegations', getDelegations);
router.post('/delegations', createDelegation);
router.delete('/delegations/:id', revokeDelegation);

export default router;
