import { Request, Response } from 'express';
import { sendLeadNotificationEmail } from '../../utils/email.js';
import { z } from 'zod';

export const contactInquirySchema = z.object({
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
  email: z.string().email('Valid email address is required'),
  phone: z.string().min(5, 'Valid phone number is required'),
  companyName: z.string().optional().default('N/A'),
  teamSize: z.string().optional().default('Not specified'),
  moduleInterest: z.string().optional().default('General Enterprise Suite'),
  source: z.string().optional().default('Website Contact'),
  message: z.string().optional().default('Inquiry submitted via portal.'),
  type: z.enum(['CONTACT_US', 'DEMO_REQUEST', 'SALES_INQUIRY', 'SUPPORT_TICKET', 'COMPANY_APPLICATION']).optional().default('CONTACT_US'),
});

export const submitContactInquiry = async (req: Request, res: Response) => {
  try {
    const validated = contactInquirySchema.parse(req.body);

    // Dispatch email directly to owner (aq0871633@gmail.com)
    const emailResult = await sendLeadNotificationEmail({
      fullName: validated.fullName,
      email: validated.email,
      phone: validated.phone,
      companyName: validated.companyName,
      teamSize: validated.teamSize,
      moduleInterest: validated.moduleInterest,
      source: validated.source,
      message: validated.message,
      type: validated.type,
    });

    return res.status(200).json({
      success: true,
      message: 'Inquiry received successfully and notification dispatched to leadership team.',
      lead: {
        fullName: validated.fullName,
        companyName: validated.companyName,
        phone: validated.phone,
        email: validated.email,
        type: validated.type,
      },
      emailDispatched: emailResult.success,
      isRealSmtp: emailResult.isRealSmtp,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
      });
    }

    console.error('Contact inquiry error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process inquiry. Please try WhatsApp or email directly.',
    });
  }
};
