import { Response, NextFunction } from 'express';
import { prisma } from '../../prisma.js';
import { AuthenticatedRequest } from '../../types/index.js';
import { AppError } from '../../middleware/errorHandler.js';
import { logAuditEvent } from '../../utils/audit.js';

export const getLeaveTypes = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user?.organizationId;
    const types = await prisma.leaveType.findMany({
      where: { organizationId: orgId },
      orderBy: { name: 'asc' },
    });
    return res.json({ success: true, data: types });
  } catch (err) {
    next(err);
  }
};

export const getLeaveBalances = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user?.organizationId;
    const { employeeId } = req.query as { employeeId?: string };
    const currentYear = new Date().getFullYear();

    const isHr =
      req.user?.isSuperAdmin ||
      ['ORG_ADMIN', 'HR_DIRECTOR', 'HR_MANAGER', 'DEPT_MANAGER'].includes(req.user?.role || '');

    const targetEmployeeId = isHr && employeeId ? employeeId : req.user?.employeeId;

    if (!targetEmployeeId) {
      return res.json({ success: true, data: [] });
    }

    const balances = await prisma.leaveBalance.findMany({
      where: {
        organizationId: orgId,
        employeeId: targetEmployeeId,
        year: currentYear,
      },
      include: {
        leaveType: true,
      },
    });

    return res.json({ success: true, data: balances });
  } catch (err) {
    next(err);
  }
};

export const getLeaveRequests = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user?.organizationId;
    const { status, employeeId } = req.query as { status?: string; employeeId?: string };

    const isHrOrManager =
      req.user?.isSuperAdmin ||
      ['ORG_ADMIN', 'HR_DIRECTOR', 'HR_MANAGER', 'DEPT_MANAGER'].includes(req.user?.role || '');

    const where: any = { organizationId: orgId };

    if (!isHrOrManager && req.user?.employeeId) {
      where.employeeId = req.user.employeeId;
    } else if (employeeId) {
      where.employeeId = employeeId;
    }

    if (status) {
      where.status = status;
    }

    const requests = await prisma.leaveRequest.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            department: { select: { name: true } },
          },
        },
        leaveType: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ success: true, data: requests });
  } catch (err) {
    next(err);
  }
};

export const submitLeaveRequest = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user?.organizationId;
    const employeeId = req.user?.employeeId;

    if (!employeeId) return next(new AppError('No employee profile associated with this account', 400));

    const { leaveTypeId, startDate, endDate, isHalfDay = false, reason } = req.body;

    if (!leaveTypeId || !startDate || !endDate || !reason) {
      return next(new AppError('Missing required fields for leave request', 400));
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start > end) {
      return next(new AppError('Start date cannot be after end date', 400));
    }

    // Calculate days requested (excluding weekends if multi-day)
    let totalDays = 0;
    if (isHalfDay) {
      totalDays = 0.5;
    } else {
      let cur = new Date(start);
      while (cur <= end) {
        if (cur.getDay() !== 0 && cur.getDay() !== 6) {
          totalDays += 1;
        }
        cur.setDate(cur.getDate() + 1);
      }
      if (totalDays === 0) totalDays = 1; // At least 1 day if selected
    }

    // Check balance
    const currentYear = new Date().getFullYear();
    const balance = await prisma.leaveBalance.findUnique({
      where: {
        employeeId_leaveTypeId_year: {
          employeeId,
          leaveTypeId,
          year: currentYear,
        },
      },
    });

    if (balance && balance.remainingDays < totalDays) {
      return next(
        new AppError(
          `Insufficient leave balance. You have ${balance.remainingDays} days remaining, requested ${totalDays} days.`,
          400
        )
      );
    }

    const request = await prisma.$transaction(async (tx) => {
      const created = await tx.leaveRequest.create({
        data: {
          organizationId: orgId!,
          employeeId,
          leaveTypeId,
          startDate: start,
          endDate: end,
          totalDays,
          isHalfDay,
          reason,
          status: 'PENDING',
        },
        include: {
          leaveType: true,
        },
      });

      if (balance) {
        await tx.leaveBalance.update({
          where: { id: balance.id },
          data: {
            pendingDays: balance.pendingDays + totalDays,
          },
        });
      }

      return created;
    });

    await logAuditEvent({
      organizationId: orgId!,
      actorId: req.user?.id,
      actorEmail: req.user?.email,
      action: 'LEAVE_REQUEST_SUBMITTED',
      entityType: 'LEAVE_REQUEST',
      entityId: request.id,
      details: { totalDays, startDate, endDate },
    });

    return res.status(201).json({
      success: true,
      message: 'Leave request submitted successfully',
      data: request,
    });
  } catch (err) {
    next(err);
  }
};

export const reviewLeaveRequest = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user?.organizationId;
    const { id } = req.params;
    const { status, reviewerNotes } = req.body;

    if (!['APPROVED', 'REJECTED'].includes(status)) {
      return next(new AppError('Status must be APPROVED or REJECTED', 400));
    }

    const requestId = id as string;
    const request = await prisma.leaveRequest.findFirst({
      where: { id: requestId, organizationId: orgId },
      include: { employee: true },
    });

    if (!request) return next(new AppError('Leave request not found', 404));
    if (request.status !== 'PENDING') return next(new AppError('Leave request is already finalized', 400));

    // Prevent Self-Approval: Managers and employees cannot approve their own leave request
    if (
      request.employeeId === req.user?.employeeId &&
      !['ORG_ADMIN', 'PLATFORM_SUPER_ADMIN'].includes(req.user?.role || '') &&
      !req.user?.isSuperAdmin
    ) {
      return next(
        new AppError('Forbidden: Managers and employees cannot approve their own leave requests. Requires HR or Company Administration review.', 403)
      );
    }

    const currentYear = request.startDate.getFullYear();

    const updated = await prisma.$transaction(async (tx) => {
      const reviewed = await tx.leaveRequest.update({
        where: { id: requestId },
        data: {
          status,
          reviewerNotes,
        },
      });

      const balance = await tx.leaveBalance.findUnique({
        where: {
          employeeId_leaveTypeId_year: {
            employeeId: request.employeeId,
            leaveTypeId: request.leaveTypeId,
            year: currentYear,
          },
        },
      });

      if (balance) {
        if (status === 'APPROVED') {
          await tx.leaveBalance.update({
            where: { id: balance.id },
            data: {
              usedDays: balance.usedDays + request.totalDays,
              pendingDays: Math.max(0, balance.pendingDays - request.totalDays),
              remainingDays: Math.max(0, balance.remainingDays - request.totalDays),
            },
          });
        } else if (status === 'REJECTED') {
          await tx.leaveBalance.update({
            where: { id: balance.id },
            data: {
              pendingDays: Math.max(0, balance.pendingDays - request.totalDays),
            },
          });
        }
      }

      // Automatically sync approved leave to Attendance records
      if (status === 'APPROVED') {
        const curDate = new Date(request.startDate);
        const endDate = new Date(request.endDate);

        while (curDate <= endDate) {
          const dayDate = new Date(curDate);
          dayDate.setHours(0, 0, 0, 0);

          // Exclude weekends if multi-day standard work week
          const dayOfWeek = dayDate.getDay();
          if (request.isHalfDay || (dayOfWeek !== 0 && dayOfWeek !== 6)) {
            await tx.attendanceRecord.upsert({
              where: {
                employeeId_date: {
                  employeeId: request.employeeId,
                  date: dayDate,
                },
              },
              create: {
                organizationId: orgId!,
                employeeId: request.employeeId,
                date: dayDate,
                status: 'ON_LEAVE',
                totalHours: 0,
                remarks: `Approved Leave: ${request.reason || 'Annual/Medical'}`,
                isManualEntry: true,
              },
              update: {
                status: 'ON_LEAVE',
                remarks: `Approved Leave: ${request.reason || 'Annual/Medical'}`,
              },
            });
          }
          curDate.setDate(curDate.getDate() + 1);
        }
      }

      return reviewed;
    });

    await logAuditEvent({
      organizationId: orgId!,
      actorId: req.user?.id,
      actorEmail: req.user?.email,
      action: `LEAVE_REQUEST_${status}`,
      entityType: 'LEAVE_REQUEST',
      entityId: requestId,
      details: { reviewerNotes },
    });

    return res.json({
      success: true,
      message: `Leave request has been ${status.toLowerCase()}`,
      data: updated,
    });
  } catch (err) {
    next(err);
  }
};
