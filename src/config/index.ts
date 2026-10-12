import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: process.env.PORT ? parseInt(process.env.PORT, 10) : 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'novahcm-enterprise-jwt-secret-key-2026-secure',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  clientUrl: process.env.CLIENT_URL || process.env.CORS_ORIGIN || 'http://localhost:5173',
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587,
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  smtpFrom: process.env.SMTP_FROM || 'SmartHCM Security <no-reply@smarthcm.io>',
  smtpSecure: process.env.SMTP_SECURE === 'true',
  requireEmailVerification: process.env.REQUIRE_EMAIL_VERIFICATION === 'true',
};
