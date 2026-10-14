import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { app } from '../src/app.js';
import { prisma } from '../src/prisma.js';

describe('Security, RBAC Enforcement & Tenant Isolation Test Suite', () => {
  const timestamp = Date.now();
  const companySlugA = `sec-corp-a-${timestamp}`;
  const companySlugB = `sec-corp-b-${timestamp}`;

  let tokenA: string;
  let orgIdA: string;
  let adminEmployeeIdA: string;

  let tokenB: string;
  let orgIdB: string;
  let adminEmployeeIdB: string;

  let managerTokenA: string;
  let managerEmployeeIdA: string;

  let employeeTokenA: string;
  let employeeEmployeeIdA: string;

  beforeAll(async () => {
    // 1. Register Company A
    const regResA = await request(app)
      .post('/api/v1/auth/register-company')
      .send({
        companyName: `Security Corp Alpha ${timestamp}`,
        slug: companySlugA,
        adminFirstName: 'Alice',
        adminLastName: 'Admin',
        adminEmail: `alice.${timestamp}@corpa.com`,
        password: 'Password123!',
        companySize: '1-25',
        plan: 'GROWTH',
        termsAccepted: true,
      });

    expect(regResA.status).toBe(201);
    tokenA = regResA.body.data.token;
    orgIdA = regResA.body.data.organization.id;
    adminEmployeeIdA = regResA.body.data.user.employeeId;

    await prisma.organization.update({
      where: { id: orgIdA },
      data: { status: 'ACTIVE' },
    });

    // 2. Register Company B
    const regResB = await request(app)
      .post('/api/v1/auth/register-company')
      .send({
        companyName: `Security Corp Beta ${timestamp}`,
        slug: companySlugB,
        adminFirstName: 'Bob',
        adminLastName: 'Beta',
        adminEmail: `bob.${timestamp}@corpb.com`,
        password: 'Password123!',
        companySize: '1-25',
        plan: 'GROWTH',
        termsAccepted: true,
      });

    expect(regResB.status).toBe(201);
    tokenB = regResB.body.data.token;
    orgIdB = regResB.body.data.organization.id;
    adminEmployeeIdB = regResB.body.data.user.employeeId;

    await prisma.organization.update({
      where: { id: orgIdB },
      data: { status: 'ACTIVE' },
    });

    const pwdHash = await bcrypt.hash('Password123!', 10);

    // 3. Create a Manager in Company A
    const mgrUser = await prisma.user.create({
      data: {
        email: `mike.mgr.${timestamp}@corpa.com`,
        passwordHash: pwdHash,
        firstName: 'Mike',
        lastName: 'Manager',
        isActive: true,
      },
    });

    await prisma.organizationMembership.create({
      data: {
        userId: mgrUser.id,
        organizationId: orgIdA,
        role: 'DEPT_MANAGER',
        isDefault: true,
      },
    });

    const mgrEmp = await prisma.employee.create({
      data: {
        organizationId: orgIdA,
        userId: mgrUser.id,
        employeeCode: `MGR-${timestamp}`,
        firstName: 'Mike',
        lastName: 'Manager',
        email: `mike.mgr.${timestamp}@corpa.com`,
        employmentStatus: 'ACTIVE',
      },
    });
    managerEmployeeIdA = mgrEmp.id;

    const mgrLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: `mike.mgr.${timestamp}@corpa.com`,
        password: 'Password123!',
      });
    managerTokenA = mgrLogin.body.data.token;

    // 4. Create an ordinary Employee in Company A
    const empUser = await prisma.user.create({
      data: {
        email: `emma.emp.${timestamp}@corpa.com`,
        passwordHash: pwdHash,
        firstName: 'Emma',
        lastName: 'Worker',
        isActive: true,
      },
    });

    await prisma.organizationMembership.create({
      data: {
        userId: empUser.id,
        organizationId: orgIdA,
        role: 'EMPLOYEE',
        isDefault: true,
      },
    });

    const empEmp = await prisma.employee.create({
      data: {
        organizationId: orgIdA,
        userId: empUser.id,
        employeeCode: `EMP-${timestamp}`,
        firstName: 'Emma',
        lastName: 'Worker',
        email: `emma.emp.${timestamp}@corpa.com`,
        employmentStatus: 'ACTIVE',
      },
    });
    employeeEmployeeIdA = empEmp.id;

    const empLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: `emma.emp.${timestamp}@corpa.com`,
        password: 'Password123!',
      });
    employeeTokenA = empLogin.body.data.token;
  });

  describe('Unauthenticated Access Protection', () => {
    it('should reject unauthenticated requests to protected endpoints with 401', async () => {
      const endpoints = [
        '/api/v1/employees',
        '/api/v1/attendance',
        '/api/v1/leaves/requests',
        '/api/v1/payroll/runs',
        '/api/v1/reports/summary',
        '/api/v1/organization/current',
      ];

      for (const ep of endpoints) {
        const res = await request(app).get(ep);
        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
      }
    });
  });

  describe('Self-Approval Prevention (Requirements 6 & 10)', () => {
    it('should prevent managers from approving their own leave requests', async () => {
      // Fetch leave type
      const typesRes = await request(app)
        .get('/api/v1/leaves/types')
        .set('Authorization', `Bearer ${managerTokenA}`);
      const leaveTypeId = typesRes.body.data[0].id;

      // Ensure manager has leave balance
      await prisma.leaveBalance.upsert({
        where: {
          employeeId_leaveTypeId_year: {
            employeeId: managerEmployeeIdA,
            leaveTypeId,
            year: new Date().getFullYear(),
          },
        },
        create: {
          organizationId: orgIdA,
          employeeId: managerEmployeeIdA,
          leaveTypeId,
          year: new Date().getFullYear(),
          allocatedDays: 15,
          remainingDays: 15,
        },
        update: {},
      });

      // Manager applies for leave
      const leaveRes = await request(app)
        .post('/api/v1/leaves/requests')
        .set('Authorization', `Bearer ${managerTokenA}`)
        .send({
          leaveTypeId,
          startDate: '2026-12-01',
          endDate: '2026-12-02',
          reason: 'Personal retreat',
        });

      expect(leaveRes.status).toBe(201);
      const leaveId = leaveRes.body.data.id;

      // Manager attempts to self-approve their own request
      const reviewRes = await request(app)
        .patch(`/api/v1/leaves/requests/${leaveId}/review`)
        .set('Authorization', `Bearer ${managerTokenA}`)
        .send({ status: 'APPROVED' });

      // Must be blocked with 403 Forbidden
      expect(reviewRes.status).toBe(403);
      expect(reviewRes.body.success).toBe(false);
      expect(reviewRes.body.message).toMatch(/cannot approve their own leave/i);
    });

    it('should prevent managers from approving their own overtime requests', async () => {
      // Manager applies for overtime
      const otRes = await request(app)
        .post('/api/v1/attendance/overtime')
        .set('Authorization', `Bearer ${managerTokenA}`)
        .send({
          date: '2026-12-05',
          hours: 3,
          reason: 'Weekend release deployment',
        });

      expect(otRes.status).toBe(201);
      const otId = otRes.body.data.id;

      // Manager attempts to self-approve their own overtime
      const reviewRes = await request(app)
        .patch(`/api/v1/attendance/overtime/${otId}/review`)
        .set('Authorization', `Bearer ${managerTokenA}`)
        .send({ status: 'APPROVED' });

      expect(reviewRes.status).toBe(403);
      expect(reviewRes.body.success).toBe(false);
      expect(reviewRes.body.message).toMatch(/cannot approve their own overtime/i);
    });

    it('should prevent managers from approving their own attendance corrections', async () => {
      const corrRes = await request(app)
        .post('/api/v1/attendance/corrections')
        .set('Authorization', `Bearer ${managerTokenA}`)
        .send({
          date: '2026-12-03',
          requestedClockIn: '2026-12-03T09:00:00Z',
          requestedClockOut: '2026-12-03T18:00:00Z',
          reason: 'Forgot badge punch',
        });

      expect(corrRes.status).toBe(201);
      const corrId = corrRes.body.data.id;

      // Manager attempts to self-approve their own correction
      const reviewRes = await request(app)
        .patch(`/api/v1/attendance/corrections/${corrId}/review`)
        .set('Authorization', `Bearer ${managerTokenA}`)
        .send({ status: 'APPROVED' });

      expect(reviewRes.status).toBe(403);
      expect(reviewRes.body.success).toBe(false);
      expect(reviewRes.body.message).toMatch(/cannot approve their own attendance/i);
    });
  });

  describe('Input Validation & Date Range Guard (Requirement 4)', () => {
    it('should reject attendance correction when clock-out is before clock-in', async () => {
      const res = await request(app)
        .post('/api/v1/attendance/corrections')
        .set('Authorization', `Bearer ${employeeTokenA}`)
        .send({
          date: '2026-12-04',
          requestedClockIn: '2026-12-04T18:00:00Z',
          requestedClockOut: '2026-12-04T09:00:00Z', // Invalid out before in
          reason: 'Typo in timestamps',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/clock-out must be after/i);
    });

    it('should reject leave request when start date is after end date', async () => {
      const typesRes = await request(app)
        .get('/api/v1/leaves/types')
        .set('Authorization', `Bearer ${employeeTokenA}`);
      const leaveTypeId = typesRes.body.data[0].id;

      const res = await request(app)
        .post('/api/v1/leaves/requests')
        .set('Authorization', `Bearer ${employeeTokenA}`)
        .send({
          leaveTypeId,
          startDate: '2026-12-25',
          endDate: '2026-12-20', // Invalid start > end
          reason: 'Invalid holiday',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/cannot be after/i);
    });
  });

  describe('Cross-Tenant Data Isolation (Requirement 7)', () => {
    it('should prevent Company A from reading Company B employee details via IDOR', async () => {
      // Company A admin queries Company B admin employee ID
      const res = await request(app)
        .get(`/api/v1/employees/${adminEmployeeIdB}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should prevent Company A from updating Company B employee record', async () => {
      const res = await request(app)
        .patch(`/api/v1/employees/${adminEmployeeIdB}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ firstName: 'TamperedName' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should prevent Company A from deleting Company B employee record', async () => {
      const res = await request(app)
        .delete(`/api/v1/employees/${adminEmployeeIdB}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Role-Based Access Control on Sensitive APIs (Requirement 6)', () => {
    it('should reject ordinary employee from accessing administrative payroll runs', async () => {
      const res = await request(app)
        .get('/api/v1/payroll/runs')
        .set('Authorization', `Bearer ${employeeTokenA}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should reject ordinary employee from processing a payroll run', async () => {
      const res = await request(app)
        .post('/api/v1/payroll/runs')
        .set('Authorization', `Bearer ${employeeTokenA}`)
        .send({ month: 12, year: 2026 });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should allow ordinary employee to access their own permitted payslips endpoint', async () => {
      const res = await request(app)
        .get('/api/v1/payroll/my-payslips')
        .set('Authorization', `Bearer ${employeeTokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });
});
