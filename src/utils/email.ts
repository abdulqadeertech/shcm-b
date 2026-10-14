import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../config/index.js';

let transporterInstance: Transporter | null = null;

export const getTransporter = async (): Promise<{ transporter: Transporter; isRealSmtp: boolean }> => {
  if (config.smtpHost && config.smtpUser && config.smtpPass) {
    if (!transporterInstance) {
      transporterInstance = nodemailer.createTransport({
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.smtpSecure,
        auth: {
          user: config.smtpUser,
          pass: config.smtpPass,
        },
      });
    }
    return { transporter: transporterInstance, isRealSmtp: true };
  }

  // Safe development / fallback mode when real SMTP credentials are not yet configured in .env
  if (!transporterInstance) {
    transporterInstance = nodemailer.createTransport({
      streamTransport: true,
      newline: 'windows',
      buffer: true,
    });
  }
  return { transporter: transporterInstance, isRealSmtp: false };
};

export interface EmailDispatchResult {
  success: boolean;
  messageId?: string;
  isRealSmtp: boolean;
  recipient: string;
  subject: string;
}

export const sendVerificationEmail = async (
  to: string,
  firstName: string,
  token: string
): Promise<EmailDispatchResult> => {
  const { transporter, isRealSmtp } = await getTransporter();
  const verifyUrl = `${config.clientUrl}/verify-email?token=${token}&email=${encodeURIComponent(to)}`;

  const subject = 'Verify your SmartHCM Work Email';
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Verify your Email - SmartHCM</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #051720; color: #f8fafc; margin: 0; padding: 20px; }
        .card { max-width: 560px; margin: 0 auto; background-color: #08222f; border: 1px solid #14425b; border-radius: 16px; padding: 32px; }
        .logo { font-size: 20px; font-weight: bold; color: #ff6f32; margin-bottom: 20px; display: inline-block; }
        h1 { color: #ffffff; font-size: 22px; margin-top: 0; }
        p { color: #94a3b8; font-size: 14px; line-height: 1.6; }
        .btn { display: inline-block; background-color: #ff6f32; color: #ffffff; padding: 12px 24px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 14px; margin: 20px 0; }
        .token-box { background-color: #051822; border: 1px dashed #14425b; padding: 12px; border-radius: 8px; font-family: monospace; font-size: 14px; color: #ff6f32; margin: 15px 0; word-break: break-all; }
        .footer { font-size: 12px; color: #64748b; margin-top: 24px; border-top: 1px solid #14425b; padding-top: 16px; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="logo">⚡ SmartHCM Enterprise</div>
        <h1>Confirm your email address</h1>
        <p>Hello ${firstName || 'there'},</p>
        <p>Thank you for signing up with SmartHCM. Please verify your email to activate all workspace capabilities and access your employee portal.</p>
        <div>
          <a href="${verifyUrl}" class="btn">Verify Work Email</a>
        </div>
        <p>Or copy and paste this verification URL into your browser:</p>
        <div class="token-box">${verifyUrl}</div>
        <p>This verification link is valid for 24 hours. If you did not create this account, you can safely ignore this email.</p>
        <div class="footer">
          &copy; ${new Date().getFullYear()} SmartHCM Cloud Enterprise. All rights reserved.
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    const info = await transporter.sendMail({
      from: config.smtpFrom,
      to,
      subject,
      html,
    });
    return {
      success: true,
      messageId: info.messageId,
      isRealSmtp,
      recipient: to,
      subject,
    };
  } catch (err: any) {
    console.error('Email verification dispatch error:', err);
    return {
      success: false,
      isRealSmtp,
      recipient: to,
      subject,
    };
  }
};

export const sendPasswordResetEmail = async (
  to: string,
  firstName: string,
  token: string
): Promise<EmailDispatchResult> => {
  const { transporter, isRealSmtp } = await getTransporter();
  const resetUrl = `${config.clientUrl}/reset-password?token=${token}&email=${encodeURIComponent(to)}`;

  const subject = 'Reset your SmartHCM Password';
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Reset Password - SmartHCM</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #051720; color: #f8fafc; margin: 0; padding: 20px; }
        .card { max-width: 560px; margin: 0 auto; background-color: #08222f; border: 1px solid #14425b; border-radius: 16px; padding: 32px; }
        .logo { font-size: 20px; font-weight: bold; color: #ff6f32; margin-bottom: 20px; display: inline-block; }
        h1 { color: #ffffff; font-size: 22px; margin-top: 0; }
        p { color: #94a3b8; font-size: 14px; line-height: 1.6; }
        .btn { display: inline-block; background-color: #ff6f32; color: #ffffff; padding: 12px 24px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 14px; margin: 20px 0; }
        .token-box { background-color: #051822; border: 1px dashed #14425b; padding: 12px; border-radius: 8px; font-family: monospace; font-size: 14px; color: #ff6f32; margin: 15px 0; word-break: break-all; }
        .footer { font-size: 12px; color: #64748b; margin-top: 24px; border-top: 1px solid #14425b; padding-top: 16px; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="logo">⚡ SmartHCM Security</div>
        <h1>Password Reset Request</h1>
        <p>Hello ${firstName || 'there'},</p>
        <p>We received a request to reset your SmartHCM portal credentials. Click the button below to choose a new secure password:</p>
        <div>
          <a href="${resetUrl}" class="btn">Reset Password</a>
        </div>
        <p>Or copy this link to your browser:</p>
        <div class="token-box">${resetUrl}</div>
        <p>This password reset link will expire in <strong>15 minutes</strong>. If you did not make this request, please contact your company HCM security administrator immediately.</p>
        <div class="footer">
          &copy; ${new Date().getFullYear()} SmartHCM Cloud Enterprise. All rights reserved.
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    const info = await transporter.sendMail({
      from: config.smtpFrom,
      to,
      subject,
      html,
    });
    return {
      success: true,
      messageId: info.messageId,
      isRealSmtp,
      recipient: to,
      subject,
    };
  } catch (err: any) {
    console.error('Password reset dispatch error:', err);
    return {
      success: false,
      isRealSmtp,
      recipient: to,
      subject,
    };
  }
};

export interface LeadNotificationPayload {
  fullName: string;
  email: string;
  phone: string;
  companyName: string;
  teamSize?: string;
  moduleInterest?: string;
  source?: string;
  message?: string;
  type?: string;
}

export const sendLeadNotificationEmail = async (
  payload: LeadNotificationPayload
): Promise<EmailDispatchResult> => {
  const { transporter, isRealSmtp } = await getTransporter();
  const recipient = config.leadNotificationEmail || 'aq0871633@gmail.com';
  const typeLabel = payload.type ? payload.type.replace(/_/g, ' ') : 'Contact Inquiry';
  const subject = `🚀 New SmartHCM Lead: ${payload.companyName || 'Visitor'} (${payload.fullName})`;

  const safePhone = (payload.phone || '').trim();
  const rawDigits = safePhone.replace(/[^0-9]/g, '');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>New SmartHCM Contact Lead</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #051720; color: #f8fafc; margin: 0; padding: 20px; }
        .card { max-width: 600px; margin: 0 auto; background-color: #08222f; border: 1px solid #14425b; border-radius: 16px; padding: 28px; }
        .badge { display: inline-block; background-color: #ff6f32; color: #ffffff; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: bold; text-transform: uppercase; margin-bottom: 12px; }
        h1 { color: #ffffff; font-size: 20px; margin-top: 0; border-bottom: 1px solid #14425b; padding-bottom: 12px; }
        .row { display: flex; padding: 8px 0; border-bottom: 1px solid #0e3547; font-size: 13px; }
        .label { width: 140px; color: #94a3b8; font-weight: 600; }
        .value { color: #f1f5f9; flex: 1; }
        .msg-box { background-color: #051822; border: 1px solid #14425b; padding: 14px; border-radius: 8px; color: #e2e8f0; font-size: 13px; margin-top: 14px; line-height: 1.5; }
        .action-btns { margin-top: 20px; text-align: center; }
        .btn-call { display: inline-block; background-color: #10b981; color: white; padding: 10px 18px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 13px; margin-right: 8px; }
        .btn-wa { display: inline-block; background-color: #25D366; color: white; padding: 10px 18px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 13px; margin-right: 8px; }
        .btn-email { display: inline-block; background-color: #ff6f32; color: white; padding: 10px 18px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 13px; }
        .footer { font-size: 11px; color: #64748b; margin-top: 24px; text-align: center; }
      </style>
    </head>
    <body>
      <div class="card">
        <span class="badge">${typeLabel}</span>
        <h1>⚡ New Lead Received on SmartHCM</h1>
        
        <div class="row">
          <div class="label">Client Name:</div>
          <div class="value"><strong>${payload.fullName}</strong></div>
        </div>
        <div class="row">
          <div class="label">Company:</div>
          <div class="value"><strong>${payload.companyName || 'N/A'}</strong></div>
        </div>
        <div class="row">
          <div class="label">Phone:</div>
          <div class="value"><a href="tel:${safePhone}" style="color: #38bdf8; text-decoration: none;">${safePhone}</a></div>
        </div>
        <div class="row">
          <div class="label">Email:</div>
          <div class="value"><a href="mailto:${payload.email}" style="color: #38bdf8; text-decoration: none;">${payload.email}</a></div>
        </div>
        ${payload.teamSize ? `
        <div class="row">
          <div class="label">Team Size:</div>
          <div class="value">${payload.teamSize}</div>
        </div>` : ''}
        ${payload.moduleInterest ? `
        <div class="row">
          <div class="label">Module Interest:</div>
          <div class="value">${payload.moduleInterest}</div>
        </div>` : ''}
        ${payload.source ? `
        <div class="row">
          <div class="label">Source:</div>
          <div class="value">${payload.source}</div>
        </div>` : ''}

        <div style="margin-top: 14px; font-size: 12px; color: #94a3b8; font-weight: 600;">Message / Requirements:</div>
        <div class="msg-box">
          ${(payload.message || 'No additional message provided.').replace(/\n/g, '<br/>')}
        </div>

        <div class="action-btns">
          <a href="tel:${safePhone.replace(/[^0-9+]/g, '')}" class="btn-call">📞 Call Client</a>
          <a href="https://wa.me/${rawDigits}" class="btn-wa">💬 WhatsApp Client</a>
          <a href="mailto:${payload.email}?subject=${encodeURIComponent(`SmartHCM Follow-up: ${payload.companyName || payload.fullName}`)}" class="btn-email">✉️ Reply Email</a>
        </div>

        <div class="footer">
          Timestamp: ${new Date().toLocaleString()} | Direct Delivery to: ${recipient}
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    const info = await transporter.sendMail({
      from: config.smtpFrom,
      to: recipient,
      subject,
      html,
    });
    console.log(`[Lead Email Dispatched] Successfully sent notification to ${recipient} (Message ID: ${info.messageId})`);
    return {
      success: true,
      messageId: info.messageId,
      isRealSmtp,
      recipient,
      subject,
    };
  } catch (err: any) {
    console.error('Lead notification email dispatch error:', err);
    return {
      success: false,
      isRealSmtp,
      recipient,
      subject,
    };
  }
};

