import { Router } from 'express';
import {
  getTickets,
  createTicket,
  updateTicket,
  addComment,
} from './helpdesk.controller.js';
import { authenticate } from '../../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/tickets', getTickets);
router.post('/tickets', createTicket);
router.patch('/tickets/:id', updateTicket);
router.post('/tickets/:id/comments', addComment);

export default router;
