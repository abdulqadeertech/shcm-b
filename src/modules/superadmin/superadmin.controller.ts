import { Response, NextFunction } from 'express';
import { prisma } from '../../prisma.js';
import { AuthenticatedRequest } from '../../types/index.js';
import { AppError } from '../../middleware/errorHandler.js';
import { logAuditEvent } from '../../utils/audit.js';

/**
 * Super Admin: Platform Overview & Global SaaS Metrics
 */
export const getPlatformOverview = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const [
      totalCompanies,
      activeCompanies,
      pendingCompanies,
      suspendedCompanies,
      rejectedCompanies,
      totalEmployees,
      totalUsers,
      recentOrgs,
      recentLogs,
    ] = await Promise.all([
      prisma.organization.count(),
      prisma.organization.count({ where: { status: 'ACTIVE' } }),
      prisma.organization.count({ where: { status: 'PENDING' } }),
      prisma.organization.count({ where: { status: 'SUSPENDED' } }),
      prisma.organization.count({ where: { status: 'REJECTED' } }),
      prisma.employee.count(),
      prisma.user.count(),
      prisma.organization.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          memberships: {
            where: { role: 'ORG_ADMIN' },
            include: { user: { select: { email: true, firstName: true, lastName: true } } },
            take: 1,
          },
          _count: { select: { employees: true } },
        },
      }),
      prisma.auditEvent.findMany({
        take: 10,
        orderBy: { timestamp: 'desc' },
        include: {
          organization: { select: { name: true, slug: true } },
        },
      }),
    ]);

    // Plan distribution
    const allOrgs = await prisma.organization.findMany({
      select: { subscriptionPlan: true },
    });

    const planDistribution: Record<string, number> = {
      STARTER: 0,
      GROWTH: 0,
      ENTERPRISE: 0,
      TRIAL: 0,
    };

    allOrgs.forEach((o) => {
      const plan = o.subscriptionPlan || 'STARTER';
      planDistribution[plan] = (planDistribution[plan] || 0) + 1;
    });

    return res.json({
      success: true,
      data: {
        companyCounts: {
          total: totalCompanies,
          active: activeCompanies,
          pending: pendingCompanies,
          suspended: suspendedCompanies,
          rejected: rejectedCompanies,
        },
        totalEmployees,
        totalUsers,
        planDistribution,
        recentRegistrations: recentOrgs.map((org) => ({
          id: org.id,
          name: org.name,
          slug: org.slug,
          status: org.status,
          plan: org.subscriptionPlan,
          maxEmployees: org.maxEmployees,
          employeeCount: org._count.employees,
          createdAt: org.createdAt,
          owner: org.memberships[0]?.user || null,
        })),
        recentAuditLogs: recentLogs,
        systemHealth: {
          status: 'OPERATIONAL',
          database: 'CONNECTED_SQLITE',
          uptimeSeconds: Math.floor(process.uptime()),
          nodeVersion: process.version,
          memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
          timestamp: new Date().toISOString(),
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Super Admin: Paginated & Filterable Company Management List
 */
export const getCompanies = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const {
      status,
      plan,
      search,
      page = '1',
      limit = '10',
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};

    if (status && status !== 'ALL') {
      where.status = status;
    }

    if (plan && plan !== 'ALL') {
      where.subscriptionPlan = plan;
    }

    if (search && search.trim()) {
      const term = search.trim();
      where.OR = [
        { name: { contains: term } },
        { slug: { contains: term } },
        { email: { contains: term } },
      ];
    }

    const [total, organizations] = await Promise.all([
      prisma.organization.count({ where }),
      prisma.organization.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { [sortBy || 'createdAt']: sortOrder === 'asc' ? 'asc' : 'desc' },
        include: {
          memberships: {
            where: { role: 'ORG_ADMIN' },
            include: {
              user: {
                select: { id: true, email: true, firstName: true, lastName: true, phone: true },
              },
            },
            take: 1,
          },
          _count: {
            select: {
              employees: true,
              departments: true,
              branches: true,
            },
          },
        },
      }),
    ]);

    const formatted = organizations.map((org) => ({
      id: org.id,
      name: org.name,
      slug: org.slug,
      email: org.email,
      phone: org.phone,
      country: org.address || 'Global',
      currency: org.currency,
      status: org.status,
      subscriptionPlan: org.subscriptionPlan,
      subscriptionStatus: org.subscriptionStatus,
      maxEmployees: org.maxEmployees,
      companySize: org.companySize,
      createdAt: org.createdAt,
      approvedAt: org.approvedAt,
      approvedBy: org.approvedBy,
      rejectionReason: org.rejectionReason,
      suspendedReason: org.suspendedReason,
      employeeCount: org._count.employees,
      departmentCount: org._count.departments,
      branchCount: org._count.branches,
      owner: org.memberships[0]?.user || null,
    }));

    return res.json({
      success: true,
      data: formatted,
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

/**
 * Super Admin: Single Company Detailed Dossier
 */
export const getCompanyDetails = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = String(req.params.id);

    const org: any = await prisma.organization.findFirst({
      where: {
        OR: [{ id }, { slug: id }],
      },
      include: {
        memberships: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                phone: true,
                isActive: true,
                createdAt: true,
              },
            },
          },
        },
        subscriptionRecords: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        _count: {
          select: {
            employees: true,
            departments: true,
            branches: true,
            shifts: true,
            payrollRuns: true,
            leaveRequests: true,
            assets: true,
          },
        },
      },
    });

    if (!org) {
      return next(new AppError('Company workspace not found.', 404));
    }

    const recentAudit = await prisma.auditEvent.findMany({
      where: { organizationId: org.id },
      take: 15,
      orderBy: { timestamp: 'desc' },
    });

    return res.json({
      success: true,
      data: {
        organization: org,
        metrics: org._count,
        subscriptionHistory: org.subscriptionRecords,
        recentAudit,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Super Admin: Update Company Status (Approve, Reject, Suspend, Reactivate)
 */
export const updateCompanyStatus = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = String(req.params.id);
    const { status, reason } = req.body;

    if (!['ACTIVE', 'PENDING', 'SUSPENDED', 'REJECTED'].includes(status)) {
      return next(new AppError('Invalid status. Permitted: ACTIVE, PENDING, SUSPENDED, REJECTED', 400));
    }

    const org = await prisma.organization.findUnique({
      where: { id },
    });

    if (!org) {
      return next(new AppError('Company workspace not found.', 404));
    }

    const previousStatus = org.status;
    const updateData: any = {
      status,
      updatedAt: new Date(),
    };

    let actionName = 'COMPANY_STATUS_UPDATED';

    if (status === 'ACTIVE') {
      updateData.approvedAt = new Date();
      updateData.approvedBy = req.user?.id;
      updateData.suspendedReason = null;
      updateData.rejectionReason = null;
      actionName = previousStatus === 'SUSPENDED' ? 'COMPANY_REACTIVATED' : 'COMPANY_APPROVED';
    } else if (status === 'REJECTED') {
      updateData.rejectionReason = reason || 'Application did not meet onboarding requirements.';
      actionName = 'COMPANY_REJECTED';
    } else if (status === 'SUSPENDED') {
      updateData.suspendedReason = reason || 'Suspended by platform administrator.';
      actionName = 'COMPANY_SUSPENDED';
    }

    const updatedOrg = await prisma.organization.update({
      where: { id },
      data: updateData,
    });

    await logAuditEvent({
      organizationId: org.id,
      actorId: req.user?.id,
      actorEmail: req.user?.email,
      action: actionName,
      entityType: 'ORGANIZATION',
      entityId: org.id,
      details: {
        previousStatus,
        newStatus: status,
        reason: reason || null,
        companyName: org.name,
      },
      ipAddress: req.ip,
    });

    return res.json({
      success: true,
      message: `Company status successfully updated to ${status}.`,
      data: updatedOrg,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Super Admin: Modify Subscription Plan and Employee Entitlement Limit
 */
export const updateCompanySubscription = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = String(req.params.id);
    const { plan, maxEmployees, subscriptionStatus = 'ACTIVE', amount = 0, interval = 'MONTHLY' } = req.body;

    if (!plan) {
      return next(new AppError('Subscription plan tier is required.', 400));
    }

    const org = await prisma.organization.findUnique({
      where: { id },
    });

    if (!org) {
      return next(new AppError('Company workspace not found.', 404));
    }

    const calculatedMax = maxEmployees !== undefined
      ? parseInt(maxEmployees, 10)
      : plan === 'ENTERPRISE'
      ? 10000
      : plan === 'GROWTH'
      ? 100
      : 25;

    const [updatedOrg, newSubRecord] = await prisma.$transaction([
      prisma.organization.update({
        where: { id },
        data: {
          subscriptionPlan: plan,
          maxEmployees: calculatedMax,
          subscriptionStatus,
          updatedAt: new Date(),
        },
      }),
      prisma.subscriptionRecord.create({
        data: {
          organizationId: org.id,
          plan,
          status: subscriptionStatus,
          maxEmployees: calculatedMax,
          amount: parseFloat(String(amount || 0)),
          currency: org.currency || 'USD',
          interval,
          startDate: new Date(),
          paymentStatus: 'PAID',
          reference: `ADMIN-UPDATE-${Date.now()}`,
        },
      }),
    ]);

    await logAuditEvent({
      organizationId: org.id,
      actorId: req.user?.id,
      actorEmail: req.user?.email,
      action: 'SUBSCRIPTION_PLAN_MODIFIED',
      entityType: 'ORGANIZATION',
      entityId: org.id,
      details: {
        previousPlan: org.subscriptionPlan,
        newPlan: plan,
        maxEmployees: calculatedMax,
        status: subscriptionStatus,
      },
      ipAddress: req.ip,
    });

    return res.json({
      success: true,
      message: `Subscription successfully updated to ${plan} with ${calculatedMax} employee capacity limit.`,
      data: {
        organization: updatedOrg,
        subscriptionRecord: newSubRecord,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Super Admin: Global Audit Trail
 */
export const getPlatformAuditLogs = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { page = '1', limit = '20', action, search } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};
    if (action && action !== 'ALL') {
      where.action = action;
    }
    if (search && search.trim()) {
      where.OR = [
        { actorEmail: { contains: search.trim() } },
        { action: { contains: search.trim() } },
        { entityType: { contains: search.trim() } },
      ];
    }

    const [total, logs] = await Promise.all([
      prisma.auditEvent.count({ where }),
      prisma.auditEvent.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { timestamp: 'desc' },
        include: {
          organization: { select: { id: true, name: true, slug: true } },
        },
      }),
    ]);

    return res.json({
      success: true,
      data: logs,
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
