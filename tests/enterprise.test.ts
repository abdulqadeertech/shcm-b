import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/prisma.js';
import bcrypt from 'bcryptjs';

describe('SmartHCM Enterprise Capabilities & Security Test Suite', () => {
  let adminToken: string;
  let payrollToken: string;
  let employeeToken: string;
  let deptManagerToken: string;
  let acmeOrgId: string;
  let betaOrgId: string;
  let betaToken: string;

  beforeAll(async () => {
    // 1. Authenticate Admin (Super Admin)
    const adminRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@novahcm.io', password: 'Password123!' });
    adminToken = adminRes.body.data.token;
    acmeOrgId = adminRes.body.data.user.organization.id;

    // 2. Authenticate Payroll Manager (David Miller)
    const payrollRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'david.miller@acmeglobal.com', password: 'Password123!' });
    payrollToken = payrollRes.body.data.token;

    // 3. Authenticate Dept Manager (Alex Rivers)
    const deptMgrRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'alex.rivers@acmeglobal.com', password: 'Password123!' });
    deptManagerToken = deptMgrRes.body.data.token;

    // 4. Authenticate Employee (Emily Watson)
    const empRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'emily.watson@acmeglobal.com', password: 'Password123!' });
    employeeToken = empRes.body.data.token;

    // 5. Setup Second Tenant (Beta Corp) for Tenant Isolation Testing
    const passwordHash = await bcrypt.hash('Password123!', 10);
    const betaOrg = await prisma.organization.upsert({
      where: { slug: 'beta-corp' },
      create: {
        name: 'Beta Global Aerospace Inc.',
        slug: 'beta-corp',
        currency: 'EUR',
      },
      update: {},
    });
    betaOrgId = betaOrg.id;

    const betaUser = await prisma.user.upsert({
      where: { email: 'ceo@betacorp.com' },
      create: {
        email: 'ceo@betacorp.com',
        passwordHash,
        firstName: 'Marcus',
        lastName: 'Vance',
        memberships: {
          create: {
            organizationId: betaOrgId,
            role: 'ORG_ADMIN',
            isDefault: true,
          },
        },
      },
      update: {},
    });

    const betaLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ceo@betacorp.com', password: 'Password123!' });
    betaToken = betaLoginRes.body.data.token;
  });

  describe('1. Tenant Isolation & Data Boundary', () => {
    it('should strictly isolate employee records between different organizations', async () => {
      // Beta Corp user queries employees
      const betaRes = await request(app)
        .get('/api/v1/employees')
        .set('Authorization', `Bearer ${betaToken}`);

      expect(betaRes.status).toBe(200);
      // Beta Corp should not see Acme Global employees (e.g. EMP-001)
      const empCodes = (betaRes.body.data || []).map((e: any) => e.employeeCode);
      expect(empCodes).not.toContain('EMP-001');
      expect(empCodes).not.toContain('EMP-005');
    });

    it('should prevent Beta Corp from accessing Acme Global workflows or requests', async () => {
      const acmeWorkflowsRes = await request(app)
        .get('/api/v1/workflows')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(acmeWorkflowsRes.status).toBe(200);
      const acmeWorkflowIds = acmeWorkflowsRes.body.data.map((w: any) => w.id);

      const betaWorkflowsRes = await request(app)
        .get('/api/v1/workflows')
        .set('Authorization', `Bearer ${betaToken}`);

      expect(betaWorkflowsRes.status).toBe(200);
      const betaWorkflowIds = betaWorkflowsRes.body.data.map((w: any) => w.id);

      // No shared workflow IDs
      acmeWorkflowIds.forEach((id: string) => {
        expect(betaWorkflowIds).not.toContain(id);
      });
    });
  });

  describe('2. Multi-Step Approval Workflows & Delegation', () => {
    let testRequestId: string;

    it('should fetch configured workflows with multiple steps', async () => {
      const res = await request(app)
        .get('/api/v1/workflows')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      const leaveWorkflow = res.body.data.find((w: any) => w.workflowType === 'LEAVE');
      expect(leaveWorkflow).toBeDefined();
      expect(leaveWorkflow.steps.length).toBeGreaterThanOrEqual(2);
    });

    it('should submit a new multi-step approval request', async () => {
      const res = await request(app)
        .post('/api/v1/workflows/requests')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({
          workflowType: 'LEAVE',
          entityType: 'LEAVE_REQUEST',
          entityId: 'REQ-TEST-AUTOMATION-01',
          summary: 'Vacation leave 2 days for technical conference',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('PENDING');
      expect(res.body.data.currentStepOrder).toBe(1);
      testRequestId = res.body.data.id;
    });

    it('should reject unauthorized approval attempt from regular employee', async () => {
      const res = await request(app)
        .post(`/api/v1/workflows/requests/${testRequestId}/act`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({
          action: 'APPROVED',
          comments: 'Self-approval attempt',
        });

      expect(res.status).toBe(403);
    });

    it('should allow authorized Dept Manager to approve Step 1 and advance to Step 2', async () => {
      const res = await request(app)
        .post(`/api/v1/workflows/requests/${testRequestId}/act`)
        .set('Authorization', `Bearer ${deptManagerToken}`)
        .send({
          action: 'APPROVED',
          comments: 'Step 1: Manager endorsement granted.',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.currentStepOrder).toBe(2);
      expect(res.body.data.status).toBe('PENDING');
    });

    it('should create and verify approval delegation', async () => {
      const res = await request(app)
        .post('/api/v1/workflows/delegations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          delegateUserId: 'test-delegate-id',
          delegateEmail: 'deputy@acmeglobal.com',
          startDate: '2026-11-01',
          endDate: '2026-11-15',
          reason: 'Annual executive leave coverage',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.isActive).toBe(true);
      expect(res.body.data.delegateEmail).toBe('deputy@acmeglobal.com');
    });
  });

  describe('3. Advanced Payroll Simulation & Review Lifecycle', () => {
    it('should simulate payroll without persisting records', async () => {
      const res = await request(app)
        .post('/api/v1/payroll/simulate')
        .set('Authorization', `Bearer ${payrollToken}`)
        .send({ month: 11, year: 2026 });

      expect(res.status).toBe(200);
      expect(res.body.data.summary.totalGross).toBeGreaterThan(0);
      expect(res.body.data.summary.totalNet).toBeGreaterThan(0);
      expect(res.body.data.projections.length).toBeGreaterThan(0);

      // Verify mathematical accuracy: gross = basic + allowances (50/50 split)
      const firstProj = res.body.data.projections[0];
      expect(firstProj.basicPay + firstProj.allowances).toBeCloseTo(firstProj.grossPay, 2);
    });

    it('should transition payroll run through DRAFT -> REVIEWED -> APPROVED', async () => {
      // Clean up previous test run if exists for idempotency
      const existing = await prisma.payrollRun.findFirst({
        where: { periodMonth: 12, periodYear: 2026, organizationId: acmeOrgId },
      });
      if (existing) {
        await prisma.payslip.deleteMany({ where: { payrollRunId: existing.id } });
        await prisma.payrollRun.delete({ where: { id: existing.id } });
      }

      // 1. Compute DRAFT
      const runRes = await request(app)
        .post('/api/v1/payroll/runs')
        .set('Authorization', `Bearer ${payrollToken}`)
        .send({ month: 12, year: 2026 });

      expect([200, 201]).toContain(runRes.status);
      const runId = runRes.body.data.id;

      // 2. Transition to REVIEWED
      const reviewRes = await request(app)
        .patch(`/api/v1/payroll/runs/${runId}/status`)
        .set('Authorization', `Bearer ${payrollToken}`)
        .send({ status: 'REVIEWED' });

      expect(reviewRes.status).toBe(200);
      expect(reviewRes.body.data.status).toBe('REVIEWED');

      // 3. Transition to APPROVED
      const approveRes = await request(app)
        .patch(`/api/v1/payroll/runs/${runId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'APPROVED' });

      expect(approveRes.status).toBe(200);
      expect(approveRes.body.data.status).toBe('APPROVED');
    });

    it('should fetch country-specific statutory payroll policies', async () => {
      const res = await request(app)
        .get('/api/v1/payroll/country-policies')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const codes = res.body.data.map((p: any) => p.countryCode);
      expect(codes).toContain('US');
      expect(codes).toContain('AE');
    });
  });

  describe('4. Business Intelligence & Traceable AI Assistant', () => {
    it('should fetch advanced analytics with date ranges and unusual-data alerts', async () => {
      const res = await request(app)
        .get('/api/v1/reports/advanced')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.headcountTotal).toBeGreaterThan(0);
      expect(res.body.data.alerts).toBeDefined();
      expect(Array.isArray(res.body.data.alerts)).toBe(true);
    });

    it('should answer natural-language headcount queries with data traceability', async () => {
      const res = await request(app)
        .post('/api/v1/reports/ai-query')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ query: 'What is our total headcount and active employee count?' });

      expect(res.status).toBe(200);
      expect(res.body.data.authorized).toBe(true);
      expect(res.body.data.answer).toContain('active employees');
      expect(res.body.data.traceability).toBeDefined();
      expect(res.body.data.traceability.queryExecuted).toBeDefined();
    });

    it('should strictly block unauthorized financial queries from regular employee', async () => {
      const res = await request(app)
        .post('/api/v1/reports/ai-query')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ query: 'What is the total payroll cost and salary budget?' });

      expect(res.status).toBe(200);
      expect(res.body.data.authorized).toBe(false);
      expect(res.body.data.answer).toContain('Access Restricted');
      expect(res.body.data.metric).toBe('Restricted');
    });
  });

  describe('5. System Security & Automated Backup Procedures', () => {
    let backupChecksum: string;
    let backupId: string;

    it('should generate an encrypted backup snapshot with SHA256 checksum', async () => {
      const res = await request(app)
        .post('/api/v1/system/backup')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(201);
      expect(res.body.data.backupId).toBeDefined();
      expect(res.body.data.checksum).toContain('SHA256:');
      expect(res.body.data.tableStats.employees).toBeGreaterThan(0);
      backupId = res.body.data.backupId;
      backupChecksum = res.body.data.checksum;
    });

    it('should validate and verify restoration procedure with valid checksum', async () => {
      const res = await request(app)
        .post('/api/v1/system/restore')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ backupId, checksum: backupChecksum });

      expect(res.status).toBe(200);
      expect(res.body.data.integrityCheck).toBe('PASSED');
    });

    it('should reject restoration with corrupted checksum', async () => {
      const res = await request(app)
        .post('/api/v1/system/restore')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ backupId, checksum: 'INVALID_CORRUPTED_CHECKSUM' });

      expect(res.status).toBe(400);
    });
  });
});
