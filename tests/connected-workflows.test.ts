import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/prisma.js';

describe('SmartHCM Connected Workflows & Differentiating Features Suite', () => {
  const timeSuffix = Date.now();
  const testCompanySlug = `wf-corp-${timeSuffix}`;

  let companyToken: string;
  let companyId: string;
  let companyEmployeeId: string;

  beforeAll(async () => {
    // Register test company workspace
    const regRes = await request(app)
      .post('/api/v1/auth/register-company')
      .send({
        companyName: `Connected Workflows Corp ${timeSuffix}`,
        slug: testCompanySlug,
        adminFirstName: 'Elena',
        adminLastName: 'Rostova',
        adminEmail: `elena.${timeSuffix}@wfcorp.com`,
        password: 'Password123!',
        companySize: '1-25',
        plan: 'GROWTH',
        termsAccepted: true,
      });

    expect(regRes.status).toBe(201);
    companyToken = regRes.body.data.token;
    companyId = regRes.body.data.organization.id;
    companyEmployeeId = regRes.body.data.user.employeeId;

    // Approve the company for full operational capabilities
    await prisma.organization.update({
      where: { id: companyId },
      data: { status: 'ACTIVE' },
    });
  });

  it('1. Overtime Request & Review Workflow: should create, approve, and sync to attendance record', async () => {
    const otDate = '2026-10-15';

    // Submit overtime request
    const otRes = await request(app)
      .post('/api/v1/attendance/overtime')
      .set('Authorization', `Bearer ${companyToken}`)
      .send({
        date: otDate,
        hours: 3.5,
        reason: 'Q4 Financial closing backlog',
      });

    expect(otRes.status).toBe(201);
    expect(otRes.body.success).toBe(true);
    const otId = otRes.body.data.id;
    expect(otRes.body.data.status).toBe('PENDING');

    // Retrieve overtime requests
    const listRes = await request(app)
      .get('/api/v1/attendance/overtime')
      .set('Authorization', `Bearer ${companyToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data.some((o: any) => o.id === otId)).toBe(true);

    // Manager / HR approves the overtime request
    const reviewRes = await request(app)
      .patch(`/api/v1/attendance/overtime/${otId}/review`)
      .set('Authorization', `Bearer ${companyToken}`)
      .send({
        status: 'APPROVED',
        reviewerNotes: 'Approved for urgent financial close',
      });

    expect(reviewRes.status).toBe(200);
    expect(reviewRes.body.data.status).toBe('APPROVED');

    // Verify linked AttendanceRecord has overtimeMinutes = 3.5 * 60 = 210
    const targetDate = new Date(otDate);
    targetDate.setHours(0, 0, 0, 0);

    const attRecord = await prisma.attendanceRecord.findFirst({
      where: {
        organizationId: companyId,
        employeeId: companyEmployeeId,
        date: targetDate,
      },
    });

    expect(attRecord).not.toBeNull();
    expect(attRecord?.overtimeMinutes).toBe(210);
  });

  it('2. Connected Leave Workflow: approving a leave request should update AttendanceRecord with ON_LEAVE', async () => {
    // Fetch default leave types
    const typesRes = await request(app)
      .get('/api/v1/leaves/types')
      .set('Authorization', `Bearer ${companyToken}`);

    expect(typesRes.status).toBe(200);
    const leaveTypeId = typesRes.body.data[0].id;

    // Apply for leave (Monday 2026-11-09 to Tuesday 2026-11-10)
    const applyRes = await request(app)
      .post('/api/v1/leaves/requests')
      .set('Authorization', `Bearer ${companyToken}`)
      .send({
        leaveTypeId,
        startDate: '2026-11-09',
        endDate: '2026-11-10',
        reason: 'Annual family retreat',
      });

    expect(applyRes.status).toBe(201);
    const leaveId = applyRes.body.data.id;

    // Approve the leave request
    const approveRes = await request(app)
      .patch(`/api/v1/leaves/requests/${leaveId}/review`)
      .set('Authorization', `Bearer ${companyToken}`)
      .send({
        status: 'APPROVED',
        reviewerNotes: 'Approved by HR',
      });

    expect(approveRes.status).toBe(200);

    // Verify attendance records were automatically marked ON_LEAVE
    const day1 = new Date('2026-11-09');
    day1.setHours(0, 0, 0, 0);

    const att1 = await prisma.attendanceRecord.findFirst({
      where: {
        organizationId: companyId,
        employeeId: companyEmployeeId,
        date: day1,
      },
    });

    expect(att1).not.toBeNull();
    expect(att1?.status).toBe('ON_LEAVE');
  });

  it('3. Smart Payroll Pre-Check (Feature D): should detect operational warnings and errors', async () => {
    // Submit a pending overtime request for November 2026
    await request(app)
      .post('/api/v1/attendance/overtime')
      .set('Authorization', `Bearer ${companyToken}`)
      .send({
        date: '2026-11-15',
        hours: 2,
        reason: 'Database migration',
      });

    // Run Pre-Check for November 2026
    const preRes = await request(app)
      .get('/api/v1/payroll/precheck?month=11&year=2026')
      .set('Authorization', `Bearer ${companyToken}`);

    expect(preRes.status).toBe(200);
    expect(preRes.body.success).toBe(true);
    expect(preRes.body.data.canProceed).toBe(true);
    // Should warn about pending overtime
    expect(preRes.body.data.warnings.some((w: any) => w.type === 'PENDING_OVERTIME_REQUESTS')).toBe(true);
  });

  it('4. Connected Payroll Engine: approved overtime should be calculated into gross and net pay', async () => {
    // Approve the pending overtime for November 2026
    const otList = await request(app)
      .get('/api/v1/attendance/overtime')
      .set('Authorization', `Bearer ${companyToken}`);

    const pendingOt = otList.body.data.find((o: any) => o.status === 'PENDING');
    if (pendingOt) {
      await request(app)
        .patch(`/api/v1/attendance/overtime/${pendingOt.id}/review`)
        .set('Authorization', `Bearer ${companyToken}`)
        .send({ status: 'APPROVED' });
    }

    // Process payroll run for November 2026
    const runRes = await request(app)
      .post('/api/v1/payroll/runs')
      .set('Authorization', `Bearer ${companyToken}`)
      .send({ month: 11, year: 2026 });

    expect(runRes.status).toBe(201);
    expect(runRes.body.data.status).toBe('DRAFT');

    // Fetch the run details and inspect the payslip
    const detailRes = await request(app)
      .get(`/api/v1/payroll/runs/${runRes.body.data.id}`)
      .set('Authorization', `Bearer ${companyToken}`);

    expect(detailRes.status).toBe(200);
    const payslip = detailRes.body.data.payslips[0];
    expect(payslip).toBeDefined();
    // Overtime pay should be calculated (> 0)
    expect(payslip.overtimePay).toBeGreaterThan(0);
    expect(payslip.grossPay).toBe(Number((payslip.basicPay + payslip.allowances + payslip.overtimePay).toFixed(2)));
  });

  it('5. Batch CSV Employee Import Workflow: supports preview and transactional batch commit', async () => {
    const importPayload = [
      {
        employeeCode: `IMP-001-${timeSuffix}`,
        firstName: 'Carlos',
        lastName: 'Mendez',
        email: `carlos.${timeSuffix}@wfcorp.com`,
        phone: '+1-555-0199',
        departmentName: 'Engineering',
        designationName: 'Senior Backend Engineer',
        baseSalary: 9500,
        employmentType: 'FULL_TIME',
      },
      {
        employeeCode: `IMP-002-${timeSuffix}`,
        firstName: 'Amina',
        lastName: 'Saeed',
        email: `amina.${timeSuffix}@wfcorp.com`,
        phone: '+1-555-0198',
        departmentName: 'Quality Assurance',
        designationName: 'QA Architect',
        baseSalary: 8800,
        employmentType: 'FULL_TIME',
      },
    ];

    // Dry-run preview
    const dryRunRes = await request(app)
      .post('/api/v1/employees/import')
      .set('Authorization', `Bearer ${companyToken}`)
      .send({ employees: importPayload, dryRun: true });

    expect(dryRunRes.status).toBe(200);
    expect(dryRunRes.body.data.validCount).toBe(2);
    expect(dryRunRes.body.data.canImport).toBe(true);

    // Commit import
    const commitRes = await request(app)
      .post('/api/v1/employees/import')
      .set('Authorization', `Bearer ${companyToken}`)
      .send({ employees: importPayload, dryRun: false });

    expect(commitRes.status).toBe(201);
    expect(commitRes.body.data.importedCount).toBe(2);

    // Verify employee and onboarding checklist were created
    const importedEmp = await prisma.employee.findFirst({
      where: {
        organizationId: companyId,
        employeeCode: `IMP-001-${timeSuffix}`,
      },
      include: {
        onboardingChecklist: { include: { items: true } },
        salaryRecord: true,
      },
    });

    expect(importedEmp).not.toBeNull();
    expect(importedEmp?.salaryRecord?.baseSalary).toBe(9500);
    expect(importedEmp?.onboardingChecklist?.items.length).toBeGreaterThan(0);
  });

  it('6. Smart HR Action Center (Feature A): aggregates real actionable system tasks', async () => {
    const acRes = await request(app)
      .get('/api/v1/system/action-center')
      .set('Authorization', `Bearer ${companyToken}`);

    expect(acRes.status).toBe(200);
    expect(acRes.body.success).toBe(true);
    expect(acRes.body.data.summary).toBeDefined();
    expect(Array.isArray(acRes.body.data.items)).toBe(true);
    // Should include draft payroll or onboarding tasks
    expect(acRes.body.data.items.length).toBeGreaterThan(0);
  });

  it('7. Company HR Health Check (Section 11 Unique Feature): calculates operational score and gaps', async () => {
    const healthRes = await request(app)
      .get('/api/v1/system/health-check')
      .set('Authorization', `Bearer ${companyToken}`);

    expect(healthRes.status).toBe(200);
    expect(healthRes.body.success).toBe(true);
    expect(typeof healthRes.body.data.score).toBe('number');
    expect(healthRes.body.data.score).toBeGreaterThanOrEqual(25);
    expect(healthRes.body.data.score).toBeLessThanOrEqual(100);
    expect(Array.isArray(healthRes.body.data.gaps)).toBe(true);
    expect(healthRes.body.data.metrics).toBeDefined();
  });

  it('8. Document Expiry Tracker (Feature B): uploads document and tracks compliance status', async () => {
    // Upload a document expiring in 15 days
    const in15Days = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();
    const docRes = await request(app)
      .post(`/api/v1/employees/${companyEmployeeId}/documents`)
      .set('Authorization', `Bearer ${companyToken}`)
      .send({
        title: 'Work Visa & Residency Permit',
        category: 'ID_PROOF',
        fileUrl: 'https://docs.smarthcm.cloud/visas/permit-2026.pdf',
        expiryDate: in15Days,
      });

    expect(docRes.status).toBe(201);

    // Retrieve document expiries
    const expRes = await request(app)
      .get('/api/v1/employees/documents/expiring')
      .set('Authorization', `Bearer ${companyToken}`);

    expect(expRes.status).toBe(200);
    expect(expRes.body.data.summary.expiringIn30DaysCount).toBeGreaterThan(0);
    expect(expRes.body.data.expiringIn30Days.some((d: any) => d.id === docRes.body.data.id)).toBe(true);
  });
});
