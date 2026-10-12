import { Response, NextFunction } from 'express';
import { prisma } from '../../prisma.js';
import { AuthenticatedRequest } from '../../types/index.js';
import { AppError } from '../../middleware/errorHandler.js';
import { logAuditEvent } from '../../utils/audit.js';

export const getPayrollRuns = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user?.organizationId;
    const runs = await prisma.payrollRun.findMany({
      where: { organizationId: orgId },
      include: {
        _count: { select: { payslips: true } },
      },
      orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
    });

    return res.json({ success: true, data: runs });
  } catch (err) {
    next(err);
  }
};

export const getPayrollRunById = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user?.organizationId;
    const { id } = req.params;
    const runId = id as string;
    const run = await prisma.payrollRun.findFirst({
      where: { id: runId, organizationId: orgId },
      include: {
        payslips: {
          include: {
            employee: {
              select: {
                id: true,
                employeeCode: true,
                firstName: true,
                lastName: true,
                department: { select: { name: true } },
                designation: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    if (!run) return next(new AppError('Payroll run not found', 404));

    return res.json({ success: true, data: run });
  } catch (err) {
    next(err);
  }
};

/**
 * Smart Payroll Pre-Check (Differentiating Feature D)
 * Detects missing salary profiles, unapproved overtime, pending attendance corrections,
 * pending leaves, and duplicate finalized periods before running payroll.
 */
export const getPayrollPrecheck = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user?.organizationId;
    if (!orgId) return next(new AppError('Organization context missing', 400));

    const month = parseInt((req.query.month as string) || String(new Date().getMonth() + 1), 10);
    const year = parseInt((req.query.year as string) || String(new Date().getFullYear()), 10);

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const [
      activeEmployees,
      existingRun,
      pendingOvertime,
      approvedOvertime,
      pendingCorrections,
      pendingLeaves,
    ] = await Promise.all([
      prisma.employee.findMany({
        where: { organizationId: orgId, employmentStatus: 'ACTIVE' },
        include: { salaryRecord: true, department: { select: { name: true } } },
      }),
      prisma.payrollRun.findUnique({
        where: {
          organizationId_periodMonth_periodYear: {
            organizationId: orgId,
            periodMonth: month,
            periodYear: year,
          },
        },
      }),
      prisma.overtimeRequest.findMany({
        where: {
          organizationId: orgId,
          status: 'PENDING',
          date: { gte: startDate, lte: endDate },
        },
        include: { employee: { select: { firstName: true, lastName: true, employeeCode: true } } },
      }),
      prisma.overtimeRequest.findMany({
        where: {
          organizationId: orgId,
          status: 'APPROVED',
          date: { gte: startDate, lte: endDate },
        },
      }),
      prisma.attendanceCorrectionRequest.findMany({
        where: {
          organizationId: orgId,
          status: 'PENDING',
          date: { gte: startDate, lte: endDate },
        },
        include: { employee: { select: { firstName: true, lastName: true, employeeCode: true } } },
      }),
      prisma.leaveRequest.findMany({
        where: {
          organizationId: orgId,
          status: 'PENDING',
          startDate: { lte: endDate },
          endDate: { gte: startDate },
        },
        include: { employee: { select: { firstName: true, lastName: true, employeeCode: true } } },
      }),
    ]);

    const errors: Array<{ type: string; message: string; employeeId?: string; details?: any }> = [];
    const warnings: Array<{ type: string; message: string; count?: number; details?: any }> = [];

    // 1. Missing Salary Records or Zero Base Salary
    const missingSalaryEmployees = activeEmployees.filter(
      (e) => !e.salaryRecord || !e.salaryRecord.baseSalary || e.salaryRecord.baseSalary <= 0
    );

    if (missingSalaryEmployees.length > 0) {
      missingSalaryEmployees.forEach((emp) => {
        errors.push({
          type: 'MISSING_SALARY_RECORD',
          message: `${emp.firstName} ${emp.lastName} (${emp.employeeCode}) has no configured base salary record.`,
          employeeId: emp.id,
        });
      });
    }

    // 2. Duplicate Finalized Payroll
    if (existingRun && ['APPROVED', 'FINALIZED', 'PAID'].includes(existingRun.status)) {
      errors.push({
        type: 'DUPLICATE_FINALIZED_RUN',
        message: `Payroll run for period ${month}/${year} is already ${existingRun.status} and cannot be re-processed.`,
        details: { runId: existingRun.id, status: existingRun.status },
      });
    }

    // 3. Pending Overtime Warnings
    if (pendingOvertime.length > 0) {
      warnings.push({
        type: 'PENDING_OVERTIME_REQUESTS',
        message: `${pendingOvertime.length} overtime request(s) are pending review and will not be paid unless approved.`,
        count: pendingOvertime.length,
        details: pendingOvertime.map((o) => ({
          employee: `${o.employee.firstName} ${o.employee.lastName}`,
          hours: o.hours,
          date: o.date,
        })),
      });
    }

    // 4. Pending Attendance Correction Warnings
    if (pendingCorrections.length > 0) {
      warnings.push({
        type: 'PENDING_ATTENDANCE_CORRECTIONS',
        message: `${pendingCorrections.length} attendance correction request(s) are pending review for this period.`,
        count: pendingCorrections.length,
      });
    }

    // 5. Pending Leaves Warnings
    if (pendingLeaves.length > 0) {
      warnings.push({
        type: 'PENDING_LEAVE_REQUESTS',
        message: `${pendingLeaves.length} leave application(s) are still pending a decision.`,
        count: pendingLeaves.length,
      });
    }

    const canProceed = errors.length === 0;

    return res.json({
      success: true,
      data: {
        canProceed,
        month,
        year,
        employeeCount: activeEmployees.length,
        existingRunStatus: existingRun ? existingRun.status : null,
        errors,
        warnings,
        approvedOvertimeHours: approvedOvertime.reduce((sum, o) => sum + o.hours, 0),
        approvedOvertimeCount: approvedOvertime.length,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Advanced Payroll Simulation
 * Calculates projected numbers with connected approved overtime without persisting to DB
 */
export const simulatePayrollRun = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user?.organizationId;
    if (!orgId) return next(new AppError('Organization context missing', 400));

    const { month, year, countryCode } = req.body;
    const monthNum = parseInt(month || new Date().getMonth() + 1, 10);
    const yearNum = parseInt(year || new Date().getFullYear(), 10);

    const startDate = new Date(yearNum, monthNum - 1, 1);
    const endDate = new Date(yearNum, monthNum, 0, 23, 59, 59);

    // Fetch active employees, salary records, and approved overtime
    const [employees, approvedOvertimes] = await Promise.all([
      prisma.employee.findMany({
        where: { organizationId: orgId, employmentStatus: 'ACTIVE' },
        include: {
          salaryRecord: true,
          department: { select: { name: true } },
        },
      }),
      prisma.overtimeRequest.findMany({
        where: {
          organizationId: orgId,
          status: 'APPROVED',
          date: { gte: startDate, lte: endDate },
        },
      }),
    ]);

    const otHoursByEmp: Record<string, number> = {};
    for (const ot of approvedOvertimes) {
      otHoursByEmp[ot.employeeId] = (otHoursByEmp[ot.employeeId] || 0) + ot.hours;
    }

    let totalGross = 0;
    let totalDeductions = 0;
    let totalNet = 0;
    let totalTax = 0;
    let totalPf = 0;
    let totalOvertimePay = 0;

    const projections = employees.map((emp) => {
      const baseSalary = emp.salaryRecord?.baseSalary || 5000;
      const approvedOtHours = otHoursByEmp[emp.id] || 0;
      // Standard hourly rate based on 240 hours/month (30 days * 8h) with 1.5x overtime multiplier
      const hourlyRate = baseSalary > 0 ? baseSalary / 240 : 0;
      const overtimePay = Number((approvedOtHours * hourlyRate * 1.5).toFixed(2));

      const basicPay = Number((baseSalary * 0.5).toFixed(2));
      const allowances = Number((baseSalary * 0.5).toFixed(2));
      const grossPay = Number((basicPay + allowances + overtimePay).toFixed(2));
      const pfDeduction = Number((basicPay * 0.12).toFixed(2));
      const taxDeducted = Number((grossPay * 0.05).toFixed(2));
      const deductions = Number((pfDeduction + taxDeducted).toFixed(2));
      const netPay = Number((grossPay - deductions).toFixed(2));

      totalGross += grossPay;
      totalDeductions += deductions;
      totalNet += netPay;
      totalTax += taxDeducted;
      totalPf += pfDeduction;
      totalOvertimePay += overtimePay;

      return {
        employeeId: emp.id,
        employeeCode: emp.employeeCode,
        employeeName: `${emp.firstName} ${emp.lastName}`,
        department: emp.department?.name || 'General',
        baseSalary,
        basicPay,
        allowances,
        overtimePay,
        approvedOtHours,
        grossPay,
        pfDeduction,
        taxDeducted,
        deductions,
        netPay,
      };
    });

    return res.json({
      success: true,
      data: {
        month: monthNum,
        year: yearNum,
        countryCode: countryCode || 'US',
        employeeCount: employees.length,
        summary: {
          totalGross: Number(totalGross.toFixed(2)),
          totalDeductions: Number(totalDeductions.toFixed(2)),
          totalPf: Number(totalPf.toFixed(2)),
          totalTax: Number(totalTax.toFixed(2)),
          totalOvertimePay: Number(totalOvertimePay.toFixed(2)),
          totalNet: Number(totalNet.toFixed(2)),
        },
        projections,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const processPayrollRun = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user?.organizationId;
    if (!orgId) return next(new AppError('Organization context missing', 400));

    const { month, year } = req.body;
    if (!month || !year) {
      return next(new AppError('Month and year are required', 400));
    }

    const monthNum = parseInt(month, 10);
    const yearNum = parseInt(year, 10);

    const existing = await prisma.payrollRun.findUnique({
      where: {
        organizationId_periodMonth_periodYear: {
          organizationId: orgId,
          periodMonth: monthNum,
          periodYear: yearNum,
        },
      },
    });

    if (existing && (existing.status === 'APPROVED' || existing.status === 'FINALIZED' || existing.status === 'PAID')) {
      return next(new AppError(`Payroll for ${monthNum}/${yearNum} is already ${existing.status} and locked from re-processing.`, 400));
    }

    const startDate = new Date(yearNum, monthNum - 1, 1);
    const endDate = new Date(yearNum, monthNum, 0, 23, 59, 59);

    const [employees, approvedOvertimes] = await Promise.all([
      prisma.employee.findMany({
        where: {
          organizationId: orgId,
          employmentStatus: 'ACTIVE',
        },
        include: {
          salaryRecord: true,
        },
      }),
      prisma.overtimeRequest.findMany({
        where: {
          organizationId: orgId,
          status: 'APPROVED',
          date: { gte: startDate, lte: endDate },
        },
      }),
    ]);

    const otHoursByEmp: Record<string, number> = {};
    for (const ot of approvedOvertimes) {
      otHoursByEmp[ot.employeeId] = (otHoursByEmp[ot.employeeId] || 0) + ot.hours;
    }

    let totalGross = 0;
    let totalDeductions = 0;
    let totalNet = 0;

    const computedItems: Array<{
      employeeId: string;
      basicPay: number;
      allowances: number;
      overtimePay: number;
      grossPay: number;
      deductions: number;
      taxDeducted: number;
      netPay: number;
    }> = [];

    for (const emp of employees) {
      const baseSalary = emp.salaryRecord?.baseSalary || 5000;
      const approvedOtHours = otHoursByEmp[emp.id] || 0;
      const hourlyRate = baseSalary > 0 ? baseSalary / 240 : 0;
      const overtimePay = Number((approvedOtHours * hourlyRate * 1.5).toFixed(2));

      const basicPay = Number((baseSalary * 0.5).toFixed(2));
      const allowances = Number((baseSalary * 0.5).toFixed(2));
      const grossPay = Number((basicPay + allowances + overtimePay).toFixed(2));
      const pfDeduction = Number((basicPay * 0.12).toFixed(2));
      const taxDeducted = Number((grossPay * 0.05).toFixed(2));
      const deductions = Number((pfDeduction + taxDeducted).toFixed(2));
      const netPay = Number((grossPay - deductions).toFixed(2));

      totalGross += grossPay;
      totalDeductions += deductions;
      totalNet += netPay;

      computedItems.push({
        employeeId: emp.id,
        basicPay,
        allowances,
        overtimePay,
        grossPay,
        deductions,
        taxDeducted,
        netPay,
      });
    }

    totalGross = Number(totalGross.toFixed(2));
    totalDeductions = Number(totalDeductions.toFixed(2));
    totalNet = Number(totalNet.toFixed(2));

    const resultRun = await prisma.$transaction(async (tx) => {
      const run = await tx.payrollRun.upsert({
        where: {
          organizationId_periodMonth_periodYear: {
            organizationId: orgId,
            periodMonth: monthNum,
            periodYear: yearNum,
          },
        },
        create: {
          organizationId: orgId,
          periodMonth: monthNum,
          periodYear: yearNum,
          startDate,
          endDate,
          totalGross,
          totalDeductions,
          totalNet,
          status: 'DRAFT',
        },
        update: {
          totalGross,
          totalDeductions,
          totalNet,
          status: 'DRAFT',
        },
      });

      await tx.payslip.deleteMany({ where: { payrollRunId: run.id } });

      for (const item of computedItems) {
        await tx.payslip.create({
          data: {
            organizationId: orgId,
            payrollRunId: run.id,
            employeeId: item.employeeId,
            periodMonth: monthNum,
            periodYear: yearNum,
            basicPay: item.basicPay,
            allowances: item.allowances,
            overtimePay: item.overtimePay,
            grossPay: item.grossPay,
            deductions: item.deductions,
            taxDeducted: item.taxDeducted,
            netPay: item.netPay,
            paymentStatus: 'UNPAID',
          },
        });
      }

      return run;
    });

    await logAuditEvent({
      organizationId: orgId,
      actorId: req.user?.id,
      actorEmail: req.user?.email,
      action: 'PAYROLL_CALCULATED',
      entityType: 'PAYROLL_RUN',
      entityId: resultRun.id,
      details: { monthNum, yearNum, totalGross, totalNet, employeeCount: computedItems.length },
    });

    return res.status(201).json({
      success: true,
      message: `Payroll run computed and set to DRAFT for ${monthNum}/${yearNum}`,
      data: resultRun,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * State Transition: DRAFT -> REVIEWED -> APPROVED -> PAID
 */
export const updatePayrollRunStatus = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user?.organizationId;
    const id = req.params.id as string;
    const { status } = req.body; // 'REVIEWED' | 'APPROVED' | 'PAID' | 'FINALIZED'

    const validStatuses = ['DRAFT', 'REVIEWED', 'APPROVED', 'FINALIZED', 'PAID'];
    if (!validStatuses.includes(status)) {
      return next(new AppError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400));
    }

    const run = await prisma.payrollRun.findFirst({
      where: { id, organizationId: orgId },
    });

    if (!run) return next(new AppError('Payroll run not found', 404));

    const updated = await prisma.$transaction(async (tx) => {
      const updatedRun = await tx.payrollRun.update({
        where: { id },
        data: {
          status,
          approvedAt: status === 'APPROVED' || status === 'FINALIZED' || status === 'PAID' ? new Date() : undefined,
        },
      });

      if (status === 'PAID' || status === 'FINALIZED') {
        await tx.payslip.updateMany({
          where: { payrollRunId: id },
          data: {
            paymentStatus: 'PAID',
            paymentDate: new Date(),
          },
        });
      }

      return updatedRun;
    });

    await logAuditEvent({
      organizationId: orgId!,
      actorId: req.user?.id,
      actorEmail: req.user?.email,
      action: `PAYROLL_STATUS_${status}`,
      entityType: 'PAYROLL_RUN',
      entityId: id,
    });

    return res.json({
      success: true,
      message: `Payroll status updated to ${status}`,
      data: updated,
    });
  } catch (err) {
    next(err);
  }
};

export const finalizePayrollRun = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  return updatePayrollRunStatus(req, res, next);
};

export const getMyPayslips = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user?.organizationId;
    const employeeId = req.user?.employeeId;

    if (!employeeId) return res.json({ success: true, data: [] });

    const payslips = await prisma.payslip.findMany({
      where: {
        organizationId: orgId,
        employeeId,
      },
      include: {
        payrollRun: true,
      },
      orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
    });

    return res.json({ success: true, data: payslips });
  } catch (err) {
    next(err);
  }
};

/**
 * Salary Revision History
 */
export const getSalaryHistory = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user?.organizationId;
    const employeeId = req.params.employeeId as string;

    const revisions = await prisma.salaryRevision.findMany({
      where: { organizationId: orgId, employeeId },
      orderBy: { effectiveDate: 'desc' },
    });

    return res.json({ success: true, data: revisions });
  } catch (err) {
    next(err);
  }
};

export const recordSalaryRevision = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user?.organizationId;
    if (!orgId) return next(new AppError('Organization context missing', 400));

    const { employeeId, effectiveDate, newBase, changeReason } = req.body;
    if (!employeeId || !newBase || !changeReason) {
      return next(new AppError('employeeId, newBase, and changeReason are required', 400));
    }

    const currentSalary = await prisma.employeeSalary.findUnique({
      where: { employeeId },
    });

    const previousBase = currentSalary?.baseSalary || 0;

    const revision = await prisma.$transaction(async (tx) => {
      const rev = await tx.salaryRevision.create({
        data: {
          organizationId: orgId,
          employeeId,
          effectiveDate: new Date(effectiveDate || Date.now()),
          previousBase,
          newBase: Number(newBase),
          changeReason,
          changedBy: req.user?.email || 'HR Admin',
        },
      });

      await tx.employeeSalary.upsert({
        where: { employeeId },
        create: {
          organizationId: orgId,
          employeeId,
          baseSalary: Number(newBase),
          currency: 'USD',
        },
        update: {
          baseSalary: Number(newBase),
        },
      });

      return rev;
    });

    await logAuditEvent({
      organizationId: orgId,
      actorId: req.user?.id,
      actorEmail: req.user?.email,
      action: 'SALARY_REVISION_RECORDED',
      entityType: 'SALARY_REVISION',
      entityId: revision.id,
      details: { employeeId, previousBase, newBase, changeReason },
    });

    return res.status(201).json({ success: true, data: revision });
  } catch (err) {
    next(err);
  }
};

/**
 * Country-Specific Payroll Policies
 */
export const getCountryPolicies = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user?.organizationId;
    const policies = await prisma.countryPayrollPolicy.findMany({
      where: { organizationId: orgId },
      orderBy: { countryName: 'asc' },
    });
    return res.json({ success: true, data: policies });
  } catch (err) {
    next(err);
  }
};

export const saveCountryPolicy = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user?.organizationId;
    if (!orgId) return next(new AppError('Organization context missing', 400));

    const { countryCode, countryName, currency, statutoryRulesJson, isReviewed } = req.body;

    const policy = await prisma.countryPayrollPolicy.upsert({
      where: {
        organizationId_countryCode: {
          organizationId: orgId,
          countryCode,
        },
      },
      create: {
        organizationId: orgId,
        countryCode,
        countryName,
        currency,
        statutoryRulesJson: typeof statutoryRulesJson === 'object' ? JSON.stringify(statutoryRulesJson) : statutoryRulesJson,
        isReviewed: isReviewed ?? true,
        reviewedBy: req.user?.email || 'Payroll Lead',
        reviewedAt: new Date(),
      },
      update: {
        countryName,
        currency,
        statutoryRulesJson: typeof statutoryRulesJson === 'object' ? JSON.stringify(statutoryRulesJson) : statutoryRulesJson,
        isReviewed: isReviewed ?? true,
        reviewedBy: req.user?.email || 'Payroll Lead',
        reviewedAt: new Date(),
      },
    });

    return res.json({ success: true, data: policy });
  } catch (err) {
    next(err);
  }
};

/**
 * Secure CSV Export of Payroll Run
 */
export const exportPayrollRunCsv = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user?.organizationId;
    const id = req.params.id as string;

    const run = (await prisma.payrollRun.findFirst({
      where: { id, organizationId: orgId },
      include: {
        payslips: {
          include: {
            employee: {
              select: {
                employeeCode: true,
                firstName: true,
                lastName: true,
                department: { select: { name: true } },
              },
            },
          },
        },
      },
    })) as any;

    if (!run) return next(new AppError('Payroll run not found', 404));

    const headers = 'Employee Code,Name,Department,Basic Pay,Allowances,Gross Pay,Deductions,Tax Withheld,Net Pay,Status\n';
    const rows = (run.payslips || [])
      .map((p: any) => {
        const name = `"${p.employee?.firstName || ''} ${p.employee?.lastName || ''}"`;
        const dept = `"${p.employee?.department?.name || 'General'}"`;
        return `${p.employee?.employeeCode || ''},${name},${dept},${p.basicPay},${p.allowances},${p.grossPay},${p.deductions},${p.taxDeducted},${p.netPay},${p.paymentStatus}`;
      })
      .join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=payroll-${run.periodYear}-${run.periodMonth}.csv`);
    return res.status(200).send(headers + rows);
  } catch (err) {
    next(err);
  }
};
