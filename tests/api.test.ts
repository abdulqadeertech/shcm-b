import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';

describe('NovaHCM Enterprise API Test Suite', () => {
  let authToken: string;
  let employeeToken: string;
  let currentOrgId: string;
  let emilyEmployeeId: string;

  beforeAll(async () => {
    // 1. Authenticate as Admin
    const adminRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'admin@novahcm.io',
        password: 'Password123!',
      });

    expect(adminRes.status).toBe(200);
    expect(adminRes.body.success).toBe(true);
    expect(adminRes.body.data.token).toBeDefined();
    authToken = adminRes.body.data.token;
    currentOrgId = adminRes.body.data.user.organization.id;

    // 2. Authenticate as Employee (Emily Watson)
    const empRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'emily.watson@acmeglobal.com',
        password: 'Password123!',
      });

    expect(empRes.status).toBe(200);
    employeeToken = empRes.body.data.token;
    emilyEmployeeId = empRes.body.data.user.employeeId;
  });

  describe('Authentication & User Profile', () => {
    it('should return 401 for invalid login credentials', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'admin@novahcm.io',
          password: 'WrongPassword!',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should fetch the authenticated user profile with organization membership', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.email).toBe('admin@novahcm.io');
    });

    it('should allow passwordless login with Google for an existing user', async () => {
      const res = await request(app)
        .post('/api/v1/auth/google')
        .send({
          email: 'admin@novahcm.io',
          name: 'System Super Admin',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.user.email).toBe('admin@novahcm.io');
    });

    it('should auto-provision and sign in a new user with Google passwordlessly', async () => {
      const uniqueGoogleEmail = `google.user.${Date.now()}@example.com`;
      const res = await request(app)
        .post('/api/v1/auth/google')
        .send({
          email: uniqueGoogleEmail,
          name: 'Alex Johnson',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.user.email).toBe(uniqueGoogleEmail);
      expect(res.body.data.user.firstName).toBe('Alex');
    });
  });

  describe('Organization & Departments', () => {
    it('should fetch current organization details with departments and branches', async () => {
      const res = await request(app)
        .get('/api/v1/organizations/current')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.slug).toBe('acme-global');
      expect(res.body.data.departments.length).toBeGreaterThan(0);
      expect(res.body.data.branches.length).toBeGreaterThan(0);
    });
  });

  describe('Employee Directory & Privacy Controls', () => {
    it('should list employees with pagination and department details', async () => {
      const res = await request(app)
        .get('/api/v1/employees')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.pagination.total).toBeGreaterThan(0);
    });

    it('should mask salary records when an employee views another peer profile', async () => {
      // Find admin's employee ID
      const listRes = await request(app)
        .get('/api/v1/employees')
        .set('Authorization', `Bearer ${authToken}`);

      const targetEmp = listRes.body.data.find((e: any) => e.employeeCode === 'EMP-001');

      // Emily views Admin's profile: salary should be masked
      const res = await request(app)
        .get(`/api/v1/employees/${targetEmp.id}`)
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.salaryRecord).toBeNull();
    });
  });

  describe('Time & Attendance', () => {
    it('should retrieve today attendance status for employee', async () => {
      const res = await request(app)
        .get('/api/v1/attendance/today')
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should list historical attendance records', async () => {
      const res = await request(app)
        .get('/api/v1/attendance')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });

  describe('Leave Management & Balances', () => {
    it('should return employee leave balances', async () => {
      const res = await request(app)
        .get('/api/v1/leaves/balances')
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0].remainingDays).toBeDefined();
    });

    it('should reject leave request exceeding available balance', async () => {
      const typesRes = await request(app)
        .get('/api/v1/leaves/types')
        .set('Authorization', `Bearer ${employeeToken}`);

      const sickLeave = typesRes.body.data.find((t: any) => t.code === 'SL');

      const res = await request(app)
        .post('/api/v1/leaves/requests')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({
          leaveTypeId: sickLeave.id,
          startDate: '2026-11-01',
          endDate: '2026-12-15', // Over 40 days, exceeds balance
          reason: 'Excessive leave request test',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Insufficient leave balance');
    });
  });

  describe('Reports & Summary', () => {
    it('should aggregate real dashboard metrics from database', async () => {
      const res = await request(app)
        .get('/api/v1/reports/summary')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.headcount).toBeGreaterThan(0);
      expect(res.body.data.departmentDistribution.length).toBeGreaterThan(0);
      expect(res.body.data.latestPayroll).toBeDefined();
    });

    it('should mask confidential company payroll for standard employees in summary', async () => {
      const res = await request(app)
        .get('/api/v1/reports/summary')
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.latestPayroll).toBeNull();
    });
  });

  describe('User Registration & AppSec Privilege Escalation Prevention', () => {
    it('should register a new standard user securely and force EMPLOYEE role', async () => {
      const testEmail = `test.user.${Date.now()}@example.com`;
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          firstName: 'Security',
          lastName: 'Tester',
          email: testEmail,
          password: 'Password123!',
          role: 'PLATFORM_SUPER_ADMIN', // Attempted privilege escalation
          isSuperAdmin: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.user.role).toBe('EMPLOYEE');
      expect(res.body.data.user.isSuperAdmin).toBe(false);
    });

    it('should reject registration when email already exists', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          firstName: 'Duplicate',
          lastName: 'User',
          email: 'admin@novahcm.io',
          password: 'Password123!',
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Employee Management & Deletion CRUD', () => {
    it('should allow HR/Admin to provision and delete an employee record', async () => {
      const code = `TEST-${Date.now().toString().slice(-4)}`;
      const createRes = await request(app)
        .post('/api/v1/employees')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          employeeCode: code,
          firstName: 'Temp',
          lastName: 'Employee',
          email: `temp.${code.toLowerCase()}@acmeglobal.com`,
          employmentType: 'FULL_TIME',
          baseSalary: '5000',
        });

      expect(createRes.status).toBe(201);
      const createdId = createRes.body.data.id;

      // Now delete the temporary employee
      const delRes = await request(app)
        .delete(`/api/v1/employees/${createdId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(delRes.status).toBe(200);
      expect(delRes.body.success).toBe(true);

      // Verify employee no longer exists
      const getRes = await request(app)
        .get(`/api/v1/employees/${createdId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(getRes.status).toBe(404);
    });
  });

  describe('Password Reset & Email Verification Workflows', () => {
    it('should generate password reset token and allow password reset', async () => {
      // 1. Request forgot password
      const forgotRes = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'david.miller@acmeglobal.com' });

      expect(forgotRes.status).toBe(200);
      expect(forgotRes.body.success).toBe(true);
      const resetToken = forgotRes.body.data?.resetToken;
      expect(resetToken).toBeDefined();

      // 2. Reject reset with invalid token
      const invalidRes = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          email: 'david.miller@acmeglobal.com',
          token: 'invalid-token-12345',
          newPassword: 'NewPassword2026!',
        });

      expect(invalidRes.status).toBe(400);

      // 3. Successfully reset with valid token
      const validRes = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          email: 'david.miller@acmeglobal.com',
          token: resetToken,
          newPassword: 'NewPassword2026!',
        });

      expect(validRes.status).toBe(200);
      expect(validRes.body.success).toBe(true);

      // 4. Login with newly reset password
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'david.miller@acmeglobal.com',
          password: 'NewPassword2026!',
        });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.data.token).toBeDefined();

      // 5. Restore original password for test repeatability
      const restoreForgot = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'david.miller@acmeglobal.com' });

      await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          email: 'david.miller@acmeglobal.com',
          token: restoreForgot.body.data.resetToken,
          newPassword: 'Password123!',
        });
    });

    it('should reject invalid email verification and allow resending verification', async () => {
      // 1. Invalid verification token should fail
      const failRes = await request(app)
        .post('/api/v1/auth/verify-email')
        .send({
          email: 'admin@novahcm.io',
          token: 'bad-token-xyz',
        });

      expect(failRes.status).toBe(400);

      // 2. Resend verification for existing account
      const resendRes = await request(app)
        .post('/api/v1/auth/resend-verification')
        .send({ email: 'alex.rivers@acmeglobal.com' });

      expect(resendRes.status).toBe(200);
      expect(resendRes.body.success).toBe(true);
    });
  });
});

