import { Router } from 'express';
import {
  getReviewCycles,
  getGoals,
  createGoal,
  updateGoalProgress,
} from './performance.controller.js';
import { authenticate } from '../../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/cycles', getReviewCycles);
router.get('/goals', getGoals);
router.post('/goals', createGoal);
router.patch('/goals/:id', updateGoalProgress);

export default router;
