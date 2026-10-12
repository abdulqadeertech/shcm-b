import { prisma } from '../prisma.js';

interface AuditParams {
  organizationId: string;
  actorId?: string;
  actorEmail?: string;
  action: string;
  entityType: string;
  entityId?: string;
  details?: any;
  ipAddress?: string;
  userAgent?: string;
}

export const logAuditEvent = async (params: AuditParams) => {
  try {
    await prisma.auditEvent.create({
      data: {
        organizationId: params.organizationId,
        actorId: params.actorId || null,
        actorEmail: params.actorEmail || null,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId || null,
        detailsJson: params.details ? JSON.stringify(params.details) : null,
        ipAddress: params.ipAddress || null,
        userAgent: params.userAgent || null,
      },
    });
  } catch (err) {
    console.error('Failed to write audit event:', err);
  }
};
