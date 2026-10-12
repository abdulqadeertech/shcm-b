import { Router } from 'express';
import { getAssets, createAsset, assignAsset } from './assets.controller.js';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';

const router = Router();

router.use(authenticate);

router.get('/', getAssets);
router.post('/', requireRole(['HR_DIRECTOR', 'HR_MANAGER']), createAsset);
router.post('/:id/assign', requireRole(['HR_DIRECTOR', 'HR_MANAGER']), assignAsset);

export default router;
