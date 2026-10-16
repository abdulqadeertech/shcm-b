import { Router } from 'express';
import {
  login,
  googleAuth,
  getMe,
  registerUser,
  registerCompany,
  checkSlug,
  getWorkspaceBySlug,
  switchOrganization,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerificationEmail,
  getNotifications,
  markNotificationRead,
  loginSchema,
  googleAuthSchema,
  registerUserSchema,
  registerCompanySchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  resendVerificationSchema,
} from './auth.controller.js';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';

const router = Router();

// Public Authentication & Onboarding Routes
router.post('/login', validate(loginSchema), login);
router.post('/google', validate(googleAuthSchema), googleAuth);
router.post('/register', validate(registerUserSchema), registerUser);
router.post('/signup', validate(registerUserSchema), registerUser);
router.post('/register-company', validate(registerCompanySchema), registerCompany);
router.get('/check-slug/:slug', checkSlug);
router.get('/workspace/:slug', getWorkspaceBySlug);
router.post('/forgot-password', validate(forgotPasswordSchema), forgotPassword);
router.post('/reset-password', validate(resetPasswordSchema), resetPassword);
router.post('/verify-email', validate(verifyEmailSchema), verifyEmail);
router.post('/resend-verification', validate(resendVerificationSchema), resendVerificationEmail);

// Authenticated Session & Tenant Switcher Routes
router.get('/me', authenticate, getMe);
router.post('/switch-org', authenticate, switchOrganization);
router.post('/switch-workspace', authenticate, switchOrganization);
router.get('/notifications', authenticate, getNotifications);
router.patch('/notifications/:id/read', authenticate, markNotificationRead);
router.post('/logout', authenticate, (req, res) => {
  res.json({ success: true, message: 'Logged out successfully' });
});

export default router;

