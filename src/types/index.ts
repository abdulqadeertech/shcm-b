import { Request } from 'express';

export type UserRole =
  | 'PLATFORM_SUPER_ADMIN'
  | 'ORG_ADMIN'
  | 'HR_DIRECTOR'
  | 'HR_MANAGER'
  | 'HR_OFFICER'
  | 'PAYROLL_MANAGER'
  | 'DEPT_MANAGER'
  | 'RECRUITER'
  | 'EMPLOYEE'
  | 'AUDITOR';

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isSuperAdmin: boolean;
  organizationId: string;
  role: UserRole;
  employeeId?: string | null;
  organizationStatus?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}
