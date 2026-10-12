import { Response, NextFunction } from 'express';
import { prisma } from '../../prisma.js';
import { AuthenticatedRequest } from '../../types/index.js';
import { AppError } from '../../middleware/errorHandler.js';

export const getAssets = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user?.organizationId;
    const { status, category } = req.query as { status?: string; category?: string };

    const where: any = { organizationId: orgId };
    if (status) where.status = status;
    if (category) where.category = category;

    const assets = await prisma.asset.findMany({
      where,
      include: {
        assignments: {
          where: { returnedDate: null },
          include: {
            employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ success: true, data: assets });
  } catch (err) {
    next(err);
  }
};

export const createAsset = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user?.organizationId;
    if (!orgId) return next(new AppError('Organization context missing', 400));

    const { name, assetCode, category, serialNumber, cost, condition = 'EXCELLENT' } = req.body;
    if (!name || !assetCode || !category) return next(new AppError('Name, asset code, and category are required', 400));

    const asset = await prisma.asset.create({
      data: {
        organizationId: orgId,
        name,
        assetCode,
        category,
        serialNumber,
        cost: cost ? parseFloat(cost) : null,
        condition,
        status: 'AVAILABLE',
      },
    });

    return res.status(201).json({ success: true, data: asset });
  } catch (err) {
    next(err);
  }
};

export const assignAsset = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user?.organizationId;
    const { id } = req.params;
    const { employeeId, notes } = req.body;

    if (!employeeId) return next(new AppError('Employee ID is required', 400));

    const assetId = id as string;
    const result = await prisma.$transaction(async (tx) => {
      const assignment = await tx.assetAssignment.create({
        data: {
          organizationId: orgId!,
          assetId,
          employeeId,
          notes,
        },
      });

      await tx.asset.update({
        where: { id: assetId },
        data: { status: 'ASSIGNED' },
      });

      return assignment;
    });

    return res.json({ success: true, message: 'Asset assigned successfully', data: result });
  } catch (err) {
    next(err);
  }
};
