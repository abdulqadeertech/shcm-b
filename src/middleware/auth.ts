import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { prisma } from '../prisma.js';
import { AuthenticatedRequest, UserRole } from '../types/index.js';
import { AppError } from './errorHandler.js';

interface JwtPayload {
  userId: string;
  organizationId?: string;
}

export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(new AppError('Authentication required. Missing token.', 401));
    }

    const token = authHeader.split(' ')[1];
    let decoded: JwtPayload;

    try {
      decoded = jwt.verify(token, config.jwtSecret) as JwtPayload;
    } catch (err) {
      return next(new AppError('Invalid or expired authentication token.', 401));
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: {
        memberships: {
          include: {
            organization: true,
          },
        },
        employee: true,
      },
    });

    if (!user || !user.isActive) {
      return next(new AppError('User account not found or deactivated.', 401));
    }

    // Determine organization context
    let targetOrgId = decoded.organizationId;
    let membership = user.memberships.find((m) => m.organizationId === targetOrgId);

    if (!membership && user.memberships.length > 0) {
      membership = user.memberships.find((m) => m.isDefault) || user.memberships[0];
      targetOrgId = membership.organizationId;
    }

    if (!membership && !user.isSuperAdmin) {
      return next(new AppError('User has no active organization membership.', 403));
    }

    const role: UserRole = (membership?.role as UserRole) || (user.isSuperAdmin ? 'PLATFORM_SUPER_ADMIN' : 'EMPLOYEE');

    req.user = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      isSuperAdmin: user.isSuperAdmin,
      organizationId: targetOrgId || user.memberships[0]?.organizationId || '',
      role,
      employeeId: user.employee?.id || null,
      organizationStatus: membership?.organization?.status || 'ACTIVE',
    };

    next();
  } catch (error) {
    next(error);
  }
};
