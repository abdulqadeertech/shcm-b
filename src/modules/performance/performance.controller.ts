import { Response, NextFunction } from 'express';
import { prisma } from '../../prisma.js';
import { AuthenticatedRequest } from '../../types/index.js';
import { AppError } from '../../middleware/errorHandler.js';

export const getReviewCycles = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user?.organizationId;
    const cycles = await prisma.performanceReviewCycle.findMany({
      where: { organizationId: orgId },
      include: {
        _count: { select: { reviews: true } },
      },
      orderBy: { startDate: 'desc' },
    });
    return res.json({ success: true, data: cycles });
  } catch (err) {
    next(err);
  }
};

export const getGoals = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user?.organizationId;
    const { employeeId } = req.query as { employeeId?: string };

    const isHrOrManager =
      req.user?.isSuperAdmin ||
      ['ORG_ADMIN', 'HR_DIRECTOR', 'HR_MANAGER', 'DEPT_MANAGER'].includes(req.user?.role || '');

    const where: any = { organizationId: orgId };
    if (!isHrOrManager && req.user?.employeeId) {
      where.employeeId = req.user.employeeId;
    } else if (employeeId) {
      where.employeeId = employeeId;
    }

    const goals = await prisma.employeeGoal.findMany({
      where,
      include: {
        employee: { select: { firstName: true, lastName: true, employeeCode: true } },
      },
      orderBy: { targetDate: 'asc' },
    });

    return res.json({ success: true, data: goals });
  } catch (err) {
    next(err);
  }
};

export const createGoal = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user?.organizationId;
    const employeeId = req.body.employeeId || req.user?.employeeId;

    if (!employeeId) return next(new AppError('Target employee is required', 400));

    const { title, description, targetDate } = req.body;
    if (!title || !targetDate) return next(new AppError('Title and target date are required', 400));

    const goal = await prisma.employeeGoal.create({
      data: {
        organizationId: orgId!,
        employeeId,
        title,
        description,
        targetDate: new Date(targetDate),
        progressPercentage: 0,
        status: 'IN_PROGRESS',
      },
    });

    return res.status(201).json({ success: true, data: goal });
  } catch (err) {
    next(err);
  }
};

export const updateGoalProgress = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user?.organizationId;
    const { id } = req.params;
    const { progressPercentage, status } = req.body;

    const goalId = id as string;
    const goal = await prisma.employeeGoal.findFirst({
      where: { id: goalId, organizationId: orgId },
    });

    if (!goal) return next(new AppError('Goal not found', 404));

    const updated = await prisma.employeeGoal.update({
      where: { id: goalId },
      data: {
        progressPercentage: progressPercentage !== undefined ? parseInt(progressPercentage, 10) : goal.progressPercentage,
        status: status || (progressPercentage === 100 ? 'COMPLETED' : goal.status),
      },
    });

    return res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
};
