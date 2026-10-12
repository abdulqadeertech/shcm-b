import { Response, NextFunction } from 'express';
import { prisma } from '../../prisma.js';
import { AuthenticatedRequest } from '../../types/index.js';
import { AppError } from '../../middleware/errorHandler.js';
import { logAuditEvent } from '../../utils/audit.js';

export const getWorkflows = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user?.organizationId;
    if (!orgId) return next(new AppError('Organization context missing', 400));

    const workflows = await prisma.approvalWorkflow.findMany({
      where: { organizationId: orgId },
      include: {
        steps: { orderBy: { stepOrder: 'asc' } },
        _count: { select: { requests: true } },
      },
      orderBy: { workflowType: 'asc' },
    });

    return res.json({ success: true, data: workflows });
  } catch (err) {
    next(err);
  }
};

export const upsertWorkflow = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user?.organizationId;
    if (!orgId) return next(new AppError('Organization context missing', 400));

    const { workflowType, name, steps } = req.body;
    if (!workflowType || !name || !Array.isArray(steps) || steps.length === 0) {
      return next(new AppError('workflowType, name, and at least one step are required', 400));
    }

    // Upsert workflow
    const workflow = await prisma.approvalWorkflow.upsert({
      where: {
        organizationId_workflowType: {
          organizationId: orgId,
          workflowType,
        },
      },
      create: {
        organizationId: orgId,
        workflowType,
        name,
        steps: {
          create: steps.map((s: any, idx: number) => ({
            stepOrder: idx + 1,
            approverRole: s.approverRole,
          })),
        },
      },
      update: {
        name,
        steps: {
          deleteMany: {},
          create: steps.map((s: any, idx: number) => ({
            stepOrder: idx + 1,
            approverRole: s.approverRole,
          })),
        },
      },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });

    await logAuditEvent({
      organizationId: orgId,
      actorId: req.user?.id,
      actorEmail: req.user?.email,
      action: 'UPDATE_APPROVAL_WORKFLOW',
      entityType: 'WORKFLOW',
      entityId: workflow.id,
      details: { workflowType, stepsCount: steps.length },
    });

    return res.json({ success: true, data: workflow });
  } catch (err) {
    next(err);
  }
};

export const getApprovalRequests = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user?.organizationId;
    if (!orgId) return next(new AppError('Organization context missing', 400));

    const { status, entityType } = req.query;

    const where: any = { organizationId: orgId };
    if (status) where.status = String(status);
    if (entityType) where.entityType = String(entityType);

    const requests = await prisma.approvalRequest.findMany({
      where,
      include: {
        workflow: {
          include: { steps: { orderBy: { stepOrder: 'asc' } } },
        },
        actions: { orderBy: { timestamp: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ success: true, data: requests });
  } catch (err) {
    next(err);
  }
};

export const submitApprovalRequest = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user?.organizationId;
    if (!orgId) return next(new AppError('Organization context missing', 400));

    const { workflowType, entityType, entityId, summary } = req.body;
    if (!workflowType || !entityType || !entityId || !summary) {
      return next(new AppError('Missing required fields for approval request', 400));
    }

    // Find workflow
    const workflow = await prisma.approvalWorkflow.findUnique({
      where: {
        organizationId_workflowType: {
          organizationId: orgId,
          workflowType,
        },
      },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });

    if (!workflow) {
      return next(new AppError(`No active workflow configured for type: ${workflowType}`, 404));
    }

    const requesterName = `${req.user?.firstName} ${req.user?.lastName}`;

    const request = await prisma.approvalRequest.create({
      data: {
        organizationId: orgId,
        workflowId: workflow.id,
        entityType,
        entityId,
        requesterId: req.user?.employeeId || req.user?.id || 'requester',
        requesterName,
        currentStepOrder: 1,
        totalSteps: workflow.steps.length,
        status: 'PENDING',
        summary,
      },
      include: {
        workflow: { include: { steps: true } },
      },
    });

    // Notify next approver role
    const firstStep = workflow.steps[0];
    if (firstStep) {
      await prisma.notification.create({
        data: {
          organizationId: orgId,
          userId: req.user?.id || '',
          title: `New Approval Request: ${summary}`,
          message: `Approval step 1 pending for ${firstStep.approverRole}.`,
          type: 'INFO',
          linkUrl: '/workflows',
        },
      });
    }

    return res.status(201).json({ success: true, data: request });
  } catch (err) {
    next(err);
  }
};

export const actOnApprovalRequest = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user?.organizationId;
    const id = req.params.id as string;
    const { action, comments } = req.body; // action: 'APPROVED' | 'REJECTED'

    if (!['APPROVED', 'REJECTED'].includes(action)) {
      return next(new AppError('Action must be APPROVED or REJECTED', 400));
    }

    const approvalReq = (await prisma.approvalRequest.findUnique({
      where: { id },
      include: {
        workflow: { include: { steps: { orderBy: { stepOrder: 'asc' } } } },
        actions: true,
      },
    })) as any;

    if (!approvalReq || approvalReq.organizationId !== orgId) {
      return next(new AppError('Approval request not found', 404));
    }

    if (approvalReq.status !== 'PENDING') {
      return next(new AppError(`Request is already ${approvalReq.status}. Duplicate processing prevented.`, 400));
    }

    const currentStep = approvalReq.workflow?.steps?.find((s: any) => s.stepOrder === approvalReq.currentStepOrder);
    if (!currentStep) {
      return next(new AppError('Workflow step configuration error', 500));
    }

    // Role check & active delegation check
    const userRole = req.user?.role;
    let isAuthorized = userRole === currentStep.approverRole || userRole === 'PLATFORM_SUPER_ADMIN' || userRole === 'ORG_ADMIN';

    if (!isAuthorized) {
      // Check if user has active delegation from someone with that role
      const now = new Date();
      const activeDelegation = await prisma.approvalDelegation.findFirst({
        where: {
          organizationId: orgId,
          delegateUserId: req.user?.id,
          isActive: true,
          startDate: { lte: now },
          endDate: { gte: now },
        },
      });

      if (activeDelegation) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return next(new AppError(`Unauthorized: Requires ${currentStep.approverRole} or active delegation to act on this step`, 403));
    }

    // Record Action
    const recordAction = await prisma.approvalAction.create({
      data: {
        requestId: id,
        stepOrder: approvalReq.currentStepOrder,
        actorId: req.user?.id || 'actor',
        actorEmail: req.user?.email || 'actor@company.com',
        actorRole: userRole || 'APPROVER',
        action,
        comments: comments || null,
      },
    });

    let newStatus = 'PENDING';
    let nextStepOrder = approvalReq.currentStepOrder;

    if (action === 'REJECTED') {
      newStatus = 'REJECTED';
    } else if (action === 'APPROVED') {
      if (approvalReq.currentStepOrder >= approvalReq.totalSteps) {
        newStatus = 'APPROVED';
      } else {
        nextStepOrder = approvalReq.currentStepOrder + 1;
      }
    }

    // Update Request
    const updatedRequest = await prisma.approvalRequest.update({
      where: { id },
      data: {
        status: newStatus,
        currentStepOrder: nextStepOrder,
      },
      include: {
        actions: { orderBy: { timestamp: 'asc' } },
        workflow: { include: { steps: true } },
      },
    });

    // If final approved or rejected, apply to underlying entity
    if (newStatus === 'APPROVED' || newStatus === 'REJECTED') {
      if (approvalReq.entityType === 'LEAVE_REQUEST') {
        await prisma.leaveRequest.updateMany({
          where: { id: approvalReq.entityId, organizationId: orgId },
          data: { status: newStatus, reviewerNotes: comments || `Multi-step workflow: ${newStatus}` },
        });
      } else if (approvalReq.entityType === 'ATTENDANCE_CORRECTION') {
        await prisma.attendanceCorrectionRequest.updateMany({
          where: { id: approvalReq.entityId, organizationId: orgId },
          data: { status: newStatus, reviewerNotes: comments || `Multi-step workflow: ${newStatus}` },
        });
      } else if (approvalReq.entityType === 'PAYROLL_RUN') {
        await prisma.payrollRun.updateMany({
          where: { id: approvalReq.entityId, organizationId: orgId },
          data: { status: newStatus === 'APPROVED' ? 'APPROVED' : 'DRAFT' },
        });
      }
    }

    await logAuditEvent({
      organizationId: orgId!,
      actorId: req.user?.id,
      actorEmail: req.user?.email,
      action: `WORKFLOW_ACTION_${action}`,
      entityType: 'APPROVAL_REQUEST',
      entityId: id,
      details: { stepOrder: approvalReq.currentStepOrder, newStatus, comments },
    });

    return res.json({
      success: true,
      data: updatedRequest,
      message: `Step ${approvalReq.currentStepOrder} ${action}. Request is now ${newStatus}.`,
    });
  } catch (err) {
    next(err);
  }
};

export const getDelegations = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user?.organizationId;
    if (!orgId) return next(new AppError('Organization context missing', 400));

    const delegations = await prisma.approvalDelegation.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ success: true, data: delegations });
  } catch (err) {
    next(err);
  }
};

export const createDelegation = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user?.organizationId;
    if (!orgId) return next(new AppError('Organization context missing', 400));

    const { delegateUserId, delegateEmail, startDate, endDate, reason } = req.body;
    if (!delegateUserId || !delegateEmail || !startDate || !endDate || !reason) {
      return next(new AppError('Missing required delegation fields', 400));
    }

    const delegation = await prisma.approvalDelegation.create({
      data: {
        organizationId: orgId,
        delegatorUserId: req.user?.id || 'delegator',
        delegatorEmail: req.user?.email || 'delegator@company.com',
        delegateUserId,
        delegateEmail,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        reason,
        isActive: true,
      },
    });

    await logAuditEvent({
      organizationId: orgId,
      actorId: req.user?.id,
      actorEmail: req.user?.email,
      action: 'CREATE_APPROVAL_DELEGATION',
      entityType: 'DELEGATION',
      entityId: delegation.id,
      details: { delegateEmail, startDate, endDate, reason },
    });

    return res.status(201).json({ success: true, data: delegation });
  } catch (err) {
    next(err);
  }
};

export const revokeDelegation = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    await prisma.approvalDelegation.update({
      where: { id },
      data: { isActive: false },
    });
    return res.json({ success: true, message: 'Delegation revoked successfully' });
  } catch (err) {
    next(err);
  }
};
