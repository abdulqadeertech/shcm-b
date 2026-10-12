import { Response, NextFunction } from 'express';
import { prisma } from '../../prisma.js';
import { AuthenticatedRequest } from '../../types/index.js';
import { AppError } from '../../middleware/errorHandler.js';
import { logAuditEvent } from '../../utils/audit.js';

export const getAttendanceRecords = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user?.organizationId;
    const { employeeId, startDate, endDate, page = '1', limit = '30' } = req.query as {
      employeeId?: string;
      startDate?: string;
      endDate?: string;
      page?: string;
      limit?: string;
    };

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 30;
    const skip = (pageNum - 1) * limitNum;

    const where: any = { organizationId: orgId };

    // If normal employee, only allow viewing their own attendance
    const isPrivileged =
      req.user?.isSuperAdmin ||
      ['ORG_ADMIN', 'HR_DIRECTOR', 'HR_MANAGER', 'HR_OFFICER', 'DEPT_MANAGER', 'AUDITOR'].includes(
        req.user?.role || ''
      );

    if (!isPrivileged && req.user?.employeeId) {
      where.employeeId = req.user.employeeId;
    } else if (employeeId) {
      where.employeeId = employeeId;
    }

    if (startDate && endDate) {
      where.date = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    }

    const [total, records] = await Promise.all([
      prisma.attendanceRecord.count({ where }),
      prisma.attendanceRecord.findMany({
        where,
        skip,
        take: limitNum,
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
        },
        orderBy: { date: 'desc' },
      }),
    ]);

    return res.json({
      success: true,
      data: records,
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

export const getTodayAttendance = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user?.organizationId;
    const employeeId = req.user?.employeeId;

    if (!employeeId) {
      return res.json({ success: true, data: null, message: 'No linked employee profile' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const record = await prisma.attendanceRecord.findFirst({
      where: {
        organizationId: orgId,
        employeeId,
        date: today,
      },
      include: {
        employee: {
          include: { shift: true },
        },
      },
    });

    return res.json({ success: true, data: record });
  } catch (err) {
    next(err);
  }
};

export const clockIn = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user?.organizationId;
    const employeeId = req.user?.employeeId;

    if (!employeeId) {
      return next(new AppError('No employee profile associated with this account', 400));
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existing = await prisma.attendanceRecord.findFirst({
      where: {
        organizationId: orgId,
        employeeId,
        date: today,
      },
    });

    if (existing && existing.clockIn) {
      return next(new AppError('You have already clocked in for today.', 400));
    }

    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { shift: true },
    });

    const now = new Date();
    let lateMinutes = 0;

    if (employee?.shift?.startTime) {
      const [shiftHour, shiftMinute] = employee.shift.startTime.split(':').map(Number);
      const shiftStartTime = new Date(now);
      shiftStartTime.setHours(shiftHour, shiftMinute, 0, 0);

      const diffMs = now.getTime() - shiftStartTime.getTime();
      const diffMinutes = Math.floor(diffMs / 60000);
      const grace = employee.shift.gracePeriodMinutes || 15;

      if (diffMinutes > grace) {
        lateMinutes = diffMinutes - grace;
      }
    }

    const record = await prisma.attendanceRecord.upsert({
      where: {
        employeeId_date: {
          employeeId,
          date: today,
        },
      },
      update: {
        clockIn: now,
        lateMinutes,
        status: 'PRESENT',
      },
      create: {
        organizationId: orgId!,
        employeeId,
        date: today,
        clockIn: now,
        lateMinutes,
        status: 'PRESENT',
      },
    });

    await logAuditEvent({
      organizationId: orgId!,
      actorId: req.user?.id,
      actorEmail: req.user?.email,
      action: 'CLOCK_IN',
      entityType: 'ATTENDANCE',
      entityId: record.id,
      details: { timestamp: now.toISOString(), lateMinutes },
    });

    return res.json({
      success: true,
      message: 'Clocked in successfully',
      data: record,
    });
  } catch (err) {
    next(err);
  }
};

export const clockOut = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user?.organizationId;
    const employeeId = req.user?.employeeId;

    if (!employeeId) {
      return next(new AppError('No employee profile associated with this account', 400));
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const record = await prisma.attendanceRecord.findFirst({
      where: {
        organizationId: orgId,
        employeeId,
        date: today,
      },
      include: {
        employee: { include: { shift: true } },
      },
    });

    if (!record || !record.clockIn) {
      return next(new AppError('You must clock in before clocking out.', 400));
    }

    if (record.clockOut) {
      return next(new AppError('You have already clocked out for today.', 400));
    }

    const now = new Date();
    const durationMs = now.getTime() - record.clockIn.getTime();
    const totalHours = Number((durationMs / (1000 * 3600)).toFixed(2));

    const halfDayThreshold = record.employee.shift?.halfDayThresholdHours || 4.5;
    const status = totalHours < halfDayThreshold ? 'HALF_DAY' : 'PRESENT';

    const updated = await prisma.attendanceRecord.update({
      where: { id: record.id },
      data: {
        clockOut: now,
        totalHours,
        status,
      },
    });

    await logAuditEvent({
      organizationId: orgId!,
      actorId: req.user?.id,
      actorEmail: req.user?.email,
      action: 'CLOCK_OUT',
      entityType: 'ATTENDANCE',
      entityId: updated.id,
      details: { timestamp: now.toISOString(), totalHours, status },
    });

    return res.json({
      success: true,
      message: 'Clocked out successfully',
      data: updated,
    });
  } catch (err) {
    next(err);
  }
};

export const requestCorrection = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user?.organizationId;
    const employeeId = req.user?.employeeId;

    if (!employeeId) return next(new AppError('No employee profile found', 400));

    const { date, requestedClockIn, requestedClockOut, reason } = req.body;
    if (!date || !requestedClockIn || !requestedClockOut || !reason) {
      return next(new AppError('Missing required fields for correction', 400));
    }

    const correction = await prisma.attendanceCorrectionRequest.create({
      data: {
        organizationId: orgId!,
        employeeId,
        date: new Date(date),
        requestedClockIn: new Date(requestedClockIn),
        requestedClockOut: new Date(requestedClockOut),
        reason,
        status: 'PENDING',
      },
    });

    return res.status(201).json({
      success: true,
      message: 'Attendance correction submitted for review',
      data: correction,
    });
  } catch (err) {
    next(err);
  }
};

export const getCorrections = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user?.organizationId;
    const isManagerOrHr =
      req.user?.isSuperAdmin ||
      ['ORG_ADMIN', 'HR_DIRECTOR', 'HR_MANAGER', 'DEPT_MANAGER'].includes(req.user?.role || '');

    const where: any = { organizationId: orgId };
    if (!isManagerOrHr && req.user?.employeeId) {
      where.employeeId = req.user.employeeId;
    }

    const corrections = await prisma.attendanceCorrectionRequest.findMany({
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
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ success: true, data: corrections });
  } catch (err) {
    next(err);
  }
};

export const reviewCorrection = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user?.organizationId;
    const { id } = req.params;
    const { status, reviewerNotes } = req.body;

    if (!['APPROVED', 'REJECTED'].includes(status)) {
      return next(new AppError('Status must be APPROVED or REJECTED', 400));
    }

    const correctionId = id as string;
    const correction = await prisma.attendanceCorrectionRequest.findFirst({
      where: { id: correctionId, organizationId: orgId },
    });

    if (!correction) return next(new AppError('Correction request not found', 404));

    const updated = await prisma.$transaction(async (tx) => {
      const reviewed = await tx.attendanceCorrectionRequest.update({
        where: { id: correctionId },
        data: {
          status,
          reviewerNotes,
        },
      });

      if (status === 'APPROVED') {
        const durationMs = correction.requestedClockOut.getTime() - correction.requestedClockIn.getTime();
        const totalHours = Number((durationMs / (1000 * 3600)).toFixed(2));

        await tx.attendanceRecord.upsert({
          where: {
            employeeId_date: {
              employeeId: correction.employeeId,
              date: correction.date,
            },
          },
          update: {
            clockIn: correction.requestedClockIn,
            clockOut: correction.requestedClockOut,
            totalHours,
            isManualEntry: true,
            remarks: `Correction approved: ${reviewerNotes || 'Approved by HR'}`,
            status: totalHours >= 4.5 ? 'PRESENT' : 'HALF_DAY',
          },
          create: {
            organizationId: orgId!,
            employeeId: correction.employeeId,
            date: correction.date,
            clockIn: correction.requestedClockIn,
            clockOut: correction.requestedClockOut,
            totalHours,
            isManualEntry: true,
            remarks: `Correction approved: ${reviewerNotes || 'Approved by HR'}`,
            status: totalHours >= 4.5 ? 'PRESENT' : 'HALF_DAY',
          },
        });
      }

      return reviewed;
    });

    return res.json({
      success: true,
      message: `Correction request ${status.toLowerCase()}`,
      data: updated,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Submit an Overtime Request (Employee Self-Service)
 */
export const requestOvertime = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user?.organizationId;
    const employeeId = req.user?.employeeId;

    if (!employeeId) return next(new AppError('No employee profile associated with this account', 400));

    const { date, hours, reason } = req.body;
    if (!date || hours === undefined || !reason) {
      return next(new AppError('Date, hours, and reason are required for overtime request', 400));
    }

    const parsedHours = parseFloat(hours);
    if (isNaN(parsedHours) || parsedHours <= 0 || parsedHours > 16) {
      return next(new AppError('Overtime hours must be a valid number between 0.5 and 16 hours', 400));
    }

    const otDate = new Date(date);
    otDate.setHours(0, 0, 0, 0);

    const overtime = await prisma.overtimeRequest.create({
      data: {
        organizationId: orgId!,
        employeeId,
        date: otDate,
        hours: parsedHours,
        reason,
        status: 'PENDING',
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    await logAuditEvent({
      organizationId: orgId!,
      actorId: req.user?.id,
      actorEmail: req.user?.email,
      action: 'OVERTIME_REQUESTED',
      entityType: 'OVERTIME_REQUEST',
      entityId: overtime.id,
      details: { date: otDate.toISOString(), hours: parsedHours, reason },
    });

    return res.status(201).json({
      success: true,
      message: 'Overtime request submitted for management approval',
      data: overtime,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Retrieve Overtime Requests (Tenant-scoped, Role-filtered)
 */
export const getOvertimeRequests = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user?.organizationId;
    const isManagerOrHr =
      req.user?.isSuperAdmin ||
      ['ORG_ADMIN', 'HR_DIRECTOR', 'HR_MANAGER', 'PAYROLL_MANAGER', 'DEPT_MANAGER'].includes(req.user?.role || '');

    const where: any = { organizationId: orgId };
    if (!isManagerOrHr && req.user?.employeeId) {
      where.employeeId = req.user.employeeId;
    }

    const requests = await prisma.overtimeRequest.findMany({
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
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ success: true, data: requests });
  } catch (err) {
    next(err);
  }
};

/**
 * Review Overtime Request (Authorized Manager / HR Decision)
 * On APPROVAL, updates the corresponding AttendanceRecord and makes it eligible for payroll calculations
 */
export const reviewOvertimeRequest = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user?.organizationId;
    const { id } = req.params;
    const { status, reviewerNotes } = req.body;

    if (!['APPROVED', 'REJECTED'].includes(status)) {
      return next(new AppError('Status must be APPROVED or REJECTED', 400));
    }

    const otId = id as string;
    const existing = await prisma.overtimeRequest.findFirst({
      where: { id: otId, organizationId: orgId },
      include: { employee: true },
    });

    if (!existing) return next(new AppError('Overtime request not found in your organization workspace', 404));
    if (existing.status !== 'PENDING') {
      return next(new AppError(`This overtime request is already finalized (${existing.status})`, 400));
    }

    const updated = await prisma.$transaction(async (tx) => {
      const reviewed = await tx.overtimeRequest.update({
        where: { id: otId },
        data: {
          status,
          reviewerNotes,
          reviewedBy: req.user?.email || 'HR Manager',
          reviewedAt: new Date(),
        },
      });

      // If approved, connect directly to AttendanceRecord
      if (status === 'APPROVED') {
        const otDate = new Date(existing.date);
        otDate.setHours(0, 0, 0, 0);
        const otMinutes = Math.round(existing.hours * 60);

        const attendance = await tx.attendanceRecord.findUnique({
          where: {
            employeeId_date: {
              employeeId: existing.employeeId,
              date: otDate,
            },
          },
        });

        if (attendance) {
          await tx.attendanceRecord.update({
            where: { id: attendance.id },
            data: {
              overtimeMinutes: (attendance.overtimeMinutes || 0) + otMinutes,
              remarks: attendance.remarks
                ? `${attendance.remarks} | Approved OT: ${existing.hours}h`
                : `Approved OT: ${existing.hours}h`,
            },
          });
        } else {
          await tx.attendanceRecord.create({
            data: {
              organizationId: orgId!,
              employeeId: existing.employeeId,
              date: otDate,
              status: 'PRESENT',
              overtimeMinutes: otMinutes,
              totalHours: existing.hours,
              isManualEntry: true,
              remarks: `Approved Overtime Only: ${existing.hours}h`,
            },
          });
        }
      }

      return reviewed;
    });

    await logAuditEvent({
      organizationId: orgId!,
      actorId: req.user?.id,
      actorEmail: req.user?.email,
      action: `OVERTIME_${status}`,
      entityType: 'OVERTIME_REQUEST',
      entityId: otId,
      details: {
        employeeId: existing.employeeId,
        hours: existing.hours,
        status,
        reviewerNotes,
      },
    });

    return res.json({
      success: true,
      message: `Overtime request has been ${status.toLowerCase()} and linked to attendance records.`,
      data: updated,
    });
  } catch (err) {
    next(err);
  }
};
