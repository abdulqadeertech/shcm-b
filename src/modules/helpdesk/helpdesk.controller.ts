import { Response, NextFunction } from 'express';
import { prisma } from '../../prisma.js';
import { AuthenticatedRequest } from '../../types/index.js';
import { AppError } from '../../middleware/errorHandler.js';

export const getTickets = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user?.organizationId;
    const { status, priority } = req.query as { status?: string; priority?: string };

    const isHrOrManager =
      req.user?.isSuperAdmin ||
      ['ORG_ADMIN', 'HR_DIRECTOR', 'HR_MANAGER'].includes(req.user?.role || '');

    const where: any = { organizationId: orgId };
    if (!isHrOrManager && req.user?.employeeId) {
      where.employeeId = req.user.employeeId;
    }
    if (status) where.status = status;
    if (priority) where.priority = priority;

    const tickets = await prisma.supportTicket.findMany({
      where,
      include: {
        employee: {
          select: { firstName: true, lastName: true, employeeCode: true },
        },
        comments: {
          include: {
            user: { select: { firstName: true, lastName: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ success: true, data: tickets });
  } catch (err) {
    next(err);
  }
};

export const createTicket = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user?.organizationId;
    const employeeId = req.user?.employeeId;

    if (!employeeId) return next(new AppError('No employee profile associated with this account', 400));

    const { subject, description, category = 'GENERAL', priority = 'MEDIUM' } = req.body;
    if (!subject || !description) return next(new AppError('Subject and description are required', 400));

    const ticket = await prisma.supportTicket.create({
      data: {
        organizationId: orgId!,
        employeeId,
        subject,
        description,
        category,
        priority,
        status: 'OPEN',
      },
    });

    return res.status(201).json({ success: true, data: ticket });
  } catch (err) {
    next(err);
  }
};

export const updateTicket = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user?.organizationId;
    const { id } = req.params;
    const { status, priority, resolutionNotes } = req.body;

    const ticketId = id as string;
    const ticket = await prisma.supportTicket.findFirst({
      where: { id: ticketId, organizationId: orgId },
    });

    if (!ticket) return next(new AppError('Ticket not found', 404));

    const updated = await prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        status: status || ticket.status,
        priority: priority || ticket.priority,
        resolutionNotes: resolutionNotes !== undefined ? resolutionNotes : ticket.resolutionNotes,
      },
    });

    return res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
};

export const addComment = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { message } = req.body;

    if (!message) return next(new AppError('Message is required', 400));

    const comment = await prisma.ticketComment.create({
      data: {
        ticketId: id as string,
        userId: req.user!.id,
        message,
      },
      include: {
        user: { select: { firstName: true, lastName: true } },
      },
    });

    return res.status(201).json({ success: true, data: comment });
  } catch (err) {
    next(err);
  }
};
