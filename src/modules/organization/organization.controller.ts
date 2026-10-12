import { Response, NextFunction } from 'express';
import { prisma } from '../../prisma.js';
import { AuthenticatedRequest } from '../../types/index.js';
import { AppError } from '../../middleware/errorHandler.js';
import { logAuditEvent } from '../../utils/audit.js';

export const getCurrentOrg = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user?.organizationId;
    if (!orgId) return next(new AppError('Organization context missing', 400));

    const organization = await prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        branches: {
          include: { _count: { select: { employees: true } } },
        },
        departments: {
          include: { _count: { select: { employees: true } } },
        },
        designations: {
          include: { _count: { select: { employees: true } } },
        },
        shifts: {
          include: { _count: { select: { employees: true } } },
        },
        countryPolicies: true,
      },
    });

    if (!organization) return next(new AppError('Organization not found', 404));

    return res.json({ success: true, data: organization });
  } catch (err) {
    next(err);
  }
};

export const updateCurrentOrg = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user?.organizationId;
    if (!orgId) return next(new AppError('Organization context missing', 400));

    const {
      name,
      timezone,
      currency,
      address,
      phone,
      email,
      primaryColor,
      brandLogoUrl,
      dateFormat,
      fiscalYearStartMonth,
      policiesJson,
    } = req.body;

    const updated = await prisma.organization.update({
      where: { id: orgId },
      data: {
        name,
        timezone,
        currency,
        address,
        phone,
        email,
        primaryColor,
        brandLogoUrl,
        dateFormat,
        fiscalYearStartMonth,
        policiesJson: typeof policiesJson === 'object' ? JSON.stringify(policiesJson) : policiesJson,
      },
    });

    await logAuditEvent({
      organizationId: orgId,
      actorId: req.user?.id,
      actorEmail: req.user?.email,
      action: 'UPDATE_ORGANIZATION_SETTINGS',
      entityType: 'ORGANIZATION',
      entityId: orgId,
      details: { name, timezone, currency, primaryColor },
    });

    return res.json({ success: true, data: updated, message: 'Organization updated successfully' });
  } catch (err) {
    next(err);
  }
};

export const getDepartments = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user?.organizationId;
    const departments = await prisma.department.findMany({
      where: { organizationId: orgId },
      include: { _count: { select: { employees: true } } },
      orderBy: { name: 'asc' },
    });
    return res.json({ success: true, data: departments });
  } catch (err) {
    next(err);
  }
};

export const createDepartment = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user?.organizationId;
    if (!orgId) return next(new AppError('Organization context missing', 400));

    const { name, code, description } = req.body;
    if (!name || !code) return next(new AppError('Name and code are required', 400));

    const existing = await prisma.department.findUnique({
      where: { organizationId_code: { organizationId: orgId, code } },
    });
    if (existing) return next(new AppError('Department code already exists', 400));

    const department = await prisma.department.create({
      data: { organizationId: orgId, name, code, description },
    });

    return res.status(201).json({ success: true, data: department });
  } catch (err) {
    next(err);
  }
};

export const getDesignations = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user?.organizationId;
    const designations = await prisma.designation.findMany({
      where: { organizationId: orgId },
      include: { _count: { select: { employees: true } } },
      orderBy: { name: 'asc' },
    });
    return res.json({ success: true, data: designations });
  } catch (err) {
    next(err);
  }
};

export const createDesignation = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user?.organizationId;
    if (!orgId) return next(new AppError('Organization context missing', 400));

    const { name, title, code, grade, description } = req.body;
    const finalName = name || title;
    if (!finalName) return next(new AppError('Designation name is required', 400));

    const finalCode = code || finalName.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);

    const designation = await prisma.designation.create({
      data: {
        organizationId: orgId,
        name: finalName,
        code: finalCode,
        grade: grade || 'L1',
        description: description || null,
      },
    });

    return res.status(201).json({ success: true, data: designation });
  } catch (err) {
    next(err);
  }
};

export const updateDepartment = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const { name, code, description } = req.body;

    const department = await prisma.department.update({
      where: { id },
      data: { name, code, description },
    });
    return res.json({ success: true, data: department });
  } catch (err) {
    next(err);
  }
};

export const deleteDepartment = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const count = await prisma.employee.count({ where: { departmentId: id } });
    if (count > 0) {
      return next(new AppError(`Cannot delete department with ${count} assigned employees. Please reassign them first.`, 400));
    }
    await prisma.department.delete({ where: { id } });
    return res.json({ success: true, message: 'Department deleted successfully' });
  } catch (err) {
    next(err);
  }
};

export const updateDesignation = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const { name, title, code, grade, description } = req.body;
    const designation = await prisma.designation.update({
      where: { id },
      data: { name: name || title, code, grade, description },
    });
    return res.json({ success: true, data: designation });
  } catch (err) {
    next(err);
  }
};

export const deleteDesignation = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const count = await prisma.employee.count({ where: { designationId: id } });
    if (count > 0) {
      return next(new AppError(`Cannot delete designation with ${count} assigned employees. Please reassign them first.`, 400));
    }
    await prisma.designation.delete({ where: { id } });
    return res.json({ success: true, message: 'Designation deleted successfully' });
  } catch (err) {
    next(err);
  }
};

export const getBranches = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user?.organizationId;
    const branches = await prisma.branch.findMany({
      where: { organizationId: orgId },
      include: { _count: { select: { employees: true } } },
      orderBy: { name: 'asc' },
    });
    return res.json({ success: true, data: branches });
  } catch (err) {
    next(err);
  }
};

export const createBranch = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user?.organizationId;
    if (!orgId) return next(new AppError('Organization context missing', 400));

    const { name, code, address, city, country, isHeadOffice } = req.body;
    if (!name || !code) return next(new AppError('Branch name and code are required', 400));

    const branch = await prisma.branch.create({
      data: {
        organizationId: orgId,
        name,
        code,
        address,
        city,
        country,
        isHeadOffice: !!isHeadOffice,
      },
    });

    return res.status(201).json({ success: true, data: branch });
  } catch (err) {
    next(err);
  }
};

export const updateBranch = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const { name, address, city, country, isHeadOffice } = req.body;

    const branch = await prisma.branch.update({
      where: { id },
      data: { name, address, city, country, isHeadOffice },
    });

    return res.json({ success: true, data: branch });
  } catch (err) {
    next(err);
  }
};

export const deleteBranch = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    await prisma.branch.delete({ where: { id } });
    return res.json({ success: true, message: 'Branch deleted successfully' });
  } catch (err) {
    next(err);
  }
};

export const getShifts = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user?.organizationId;
    const shifts = await prisma.shift.findMany({
      where: { organizationId: orgId },
      include: { _count: { select: { employees: true } } },
      orderBy: { name: 'asc' },
    });
    return res.json({ success: true, data: shifts });
  } catch (err) {
    next(err);
  }
};

export const createShift = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user?.organizationId;
    if (!orgId) return next(new AppError('Organization context missing', 400));

    const { name, code, startTime, endTime, gracePeriodMinutes, halfDayThresholdHours, isOvernight } = req.body;
    if (!name || !code) return next(new AppError('Shift name and code are required', 400));

    const shift = await prisma.shift.create({
      data: {
        organizationId: orgId,
        name,
        code,
        startTime: startTime || '09:00',
        endTime: endTime || '18:00',
        gracePeriodMinutes: gracePeriodMinutes !== undefined ? Number(gracePeriodMinutes) : 15,
        halfDayThresholdHours: halfDayThresholdHours !== undefined ? Number(halfDayThresholdHours) : 4.5,
        isOvernight: !!isOvernight,
      },
    });

    return res.status(201).json({ success: true, data: shift });
  } catch (err) {
    next(err);
  }
};

export const updateShift = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const { name, code, startTime, endTime, gracePeriodMinutes, halfDayThresholdHours, isOvernight } = req.body;

    const shift = await prisma.shift.update({
      where: { id },
      data: {
        name,
        code,
        startTime,
        endTime,
        gracePeriodMinutes: gracePeriodMinutes !== undefined ? Number(gracePeriodMinutes) : undefined,
        halfDayThresholdHours: halfDayThresholdHours !== undefined ? Number(halfDayThresholdHours) : undefined,
        isOvernight: isOvernight !== undefined ? !!isOvernight : undefined,
      },
    });

    return res.json({ success: true, data: shift });
  } catch (err) {
    next(err);
  }
};

export const deleteShift = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const count = await prisma.employee.count({ where: { shiftId: id } });
    if (count > 0) {
      return next(new AppError(`Cannot delete shift with ${count} assigned employees. Please reassign them first.`, 400));
    }
    await prisma.shift.delete({ where: { id } });
    return res.json({ success: true, message: 'Shift deleted successfully' });
  } catch (err) {
    next(err);
  }
};
