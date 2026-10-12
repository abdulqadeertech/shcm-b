import { Response, NextFunction } from 'express';
import { AuthenticatedRequest, UserRole } from '../types/index.js';
import { AppError } from './errorHandler.js';

export const requireRole = (allowedRoles: UserRole[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('Unauthorized. Please log in.', 401));
    }

    if (req.user.isSuperAdmin || req.user.role === 'PLATFORM_SUPER_ADMIN') {
      return next();
    }

    if (req.user.role === 'ORG_ADMIN') {
      return next();
    }

    if (allowedRoles.includes(req.user.role)) {
      return next();
    }

    return next(new AppError('Forbidden. Insufficient permissions for this operation.', 403));
  };
};

export const requireSuperAdmin = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return next(new AppError('Unauthorized. Please log in.', 401));
  }

  if (!req.user.isSuperAdmin && req.user.role !== 'PLATFORM_SUPER_ADMIN') {
    return next(new AppError('Forbidden. Platform Super Administrator privileges required.', 403));
  }

  next();
};

export const requireActiveWorkspace = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return next(new AppError('Unauthorized. Please log in.', 401));
  }

  // Super Admin can inspect any workspace
  if (req.user.isSuperAdmin || req.user.role === 'PLATFORM_SUPER_ADMIN') {
    return next();
  }

  // The organization status check can be attached to req.user during authenticate
  const orgStatus = (req.user as any).organizationStatus || 'ACTIVE';

  if (orgStatus === 'PENDING') {
    return next(new AppError('Workspace registration is pending administrative approval.', 403));
  }

  if (orgStatus === 'SUSPENDED') {
    return next(new AppError('This workspace is suspended. Please contact platform administration.', 403));
  }

  if (orgStatus === 'REJECTED') {
    return next(new AppError('This workspace application was not approved.', 403));
  }

  next();
};

