import { Response, NextFunction } from 'express';
import { prisma } from '../../prisma.js';
import { AuthenticatedRequest } from '../../types/index.js';
import { AppError } from '../../middleware/errorHandler.js';

export const getAuditEvents = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user?.organizationId;
    if (!orgId) return next(new AppError('Organization context missing', 400));

    const { page = '1', limit = '50', action } = req.query as { page?: string; limit?: string; action?: string };

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const skip = (pageNum - 1) * limitNum;

    const where: any = { organizationId: orgId };
    if (action) where.action = action;

    const [total, events] = await Promise.all([
      prisma.auditEvent.count({ where }),
      prisma.auditEvent.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { timestamp: 'desc' },
      }),
    ]);

    return res.json({
      success: true,
      data: events,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    next(err);
  }
};
