import { Router } from 'express';
import { submitContactInquiry } from './contact.controller.js';

const router = Router();

// Public contact & lead submission endpoint
router.post('/', submitContactInquiry);

export default router;
