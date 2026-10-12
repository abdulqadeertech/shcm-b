import { Router } from 'express';
import { getAuditEvents } from './audit.controller.js';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';

const router = Router();

router.use(authenticate);

router.get('/events', requireRole(['HR_DIRECTOR', 'AUDITOR']), getAuditEvents);

export default router;
