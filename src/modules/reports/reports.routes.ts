import { Router } from 'express';
import {
  getDashboardSummary,
  getAttendanceTrends,
  getAdvancedAnalytics,
  getSavedReports,
  createSavedReport,
  deleteSavedReport,
  queryAiAssistant,
} from './reports.controller.js';
import { authenticate } from '../../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/summary', getDashboardSummary);
router.get('/attendance-trends', getAttendanceTrends);
router.get('/advanced', getAdvancedAnalytics);

router.get('/saved', getSavedReports);
router.post('/saved', createSavedReport);
router.delete('/saved/:id', deleteSavedReport);

router.post('/ai-query', queryAiAssistant);

export default router;
