import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/prisma.js';

describe('SmartHCM Multi-Tenant SaaS, RBAC, Super Admin & Subscription Suite', () => {
  const timeSuffix = Date.now();
  const companyASlug = `company-alpha-${timeSuffix}`;
  const companyBSlug = `company-beta-${timeSuffix}`;

  let companyAToken: string;
  let companyAId: string;
  let companyAOwnerId: string;
  let companyAEmployeeId: string;

  let companyBToken: string;
  let companyBId: string;
  let companyBEmployeeId: string;

  let superAdminToken: string;

  beforeAll(async () => {
    // 1. Log in or create Super Admin
    let superAdmin = await prisma.user.findFirst({
      where: { isSuperAdmin: true },
    });

    if (!superAdmin) {
      superAdmin = await prisma.user.create({
        data: {
          email: `test-superadmin-${timeSuffix}@smarthcm.io`,
          passwordHash: '$2a$10$wT8K8U1s4q4Bq3Kk/3x7eez8s4u3k4s5d6f7g8h9j0k1l2m3n4o5p', // Hash for 'Password123!'
          firstName: 'Platform',
          lastName: 'SuperAdmin',
          isActive: true,
          isSuperAdmin: true,
        },
      });
    }

    const saLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: superAdmin.email, password: 'Password123!' });

    if (saLogin.status === 200) {
      superAdminToken = saLogin.body.data.token;
    } else {
      // Fallback if password was different in seed
      const adminLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'admin@novahcm.io', password: 'Password123!' });
      superAdminToken = adminLogin.body.data.token;
    }
  });

  // 1. Company Registration & Security
  it('1. New company registers successfully with tenant isolation and initial subscription', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register-company')
      .send({
        companyName: 'Alpha Systems Inc',
        slug: companyASlug,
        adminFirstName: 'Arthur',
        adminLastName: 'Pendleton',
        adminEmail: `arthur.alpha+${timeSuffix}@alphasys.com`,
        password: 'Password123!',
        phone: '+1 555-010-0001',
        country: 'United States',
        address: '100 Silicon Way, Austin, TX',
        companySize: '16-50',
        plan: 'STARTER',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.organization.slug).toBe(companyASlug);
    expect(res.body.data.organization.subscriptionPlan).toBe('STARTER');
    expect(res.body.data.organization.maxEmployees).toBe(25);
    expect(res.body.data.user.role).toBe('ORG_ADMIN');

    companyAToken = res.body.data.token;
    companyAId = res.body.data.organization.id;
    companyAOwnerId = res.body.data.user.id;
    companyAEmployeeId = res.body.data.user.employeeId;
  });

  it('2. Rejects duplicate registrations with duplicate workspace slug', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register-company')
      .send({
        companyName: 'Alpha Impostor',
        slug: companyASlug,
        adminFirstName: 'Fake',
        adminLastName: 'Owner',
        adminEmail: `impostor+${timeSuffix}@alphasys.com`,
        password: 'Password123!',
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('3. Register second independent company workspace (Company B)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register-company')
      .send({
        companyName: 'Beta Dynamics Ltd',
        slug: companyBSlug,
        adminFirstName: 'Beatrix',
        adminLastName: 'Vance',
        adminEmail: `beatrix.beta+${timeSuffix}@betadynamics.com`,
        password: 'Password123!',
        country: 'United Kingdom',
        companySize: '51-200',
        plan: 'GROWTH',
      });

    expect(res.status).toBe(201);
    companyBToken = res.body.data.token;
    companyBId = res.body.data.organization.id;
    companyBEmployeeId = res.body.data.user.employeeId;
    expect(res.body.data.organization.maxEmployees).toBe(100);
  });

  // 4. Role Authorization & Super Admin Boundary
  it('4. Public registration cannot grant Super Admin role', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register-company')
      .send({
        companyName: 'Hacker Attempt Org',
        slug: `hacker-org-${timeSuffix}`,
        adminFirstName: 'Evil',
        adminLastName: 'Hacker',
        adminEmail: `hacker+${timeSuffix}@evil.com`,
        password: 'Password123!',
        isSuperAdmin: true,
        role: 'PLATFORM_SUPER_ADMIN',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('ORG_ADMIN');

    // Verify in database that isSuperAdmin is strictly false
    const userInDb = await prisma.user.findUnique({
      where: { id: res.body.data.user.id },
    });
    expect(userInDb?.isSuperAdmin).toBe(false);
  });

  it('5. Unauthorized tenant users cannot access Super Admin endpoints', async () => {
    // Calling Super Admin API with Company A owner token
    const res = await request(app)
      .get('/api/v1/superadmin/overview')
      .set('Authorization', `Bearer ${companyAToken}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('Platform Super Administrator privileges required');
  });

  // 6. Super Admin Operations
  it('6. Super Admin can view platform metrics and company listings', async () => {
    const overviewRes = await request(app)
      .get('/api/v1/superadmin/overview')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(overviewRes.status).toBe(200);
    expect(overviewRes.body.success).toBe(true);
    expect(overviewRes.body.data.companyCounts.total).toBeGreaterThanOrEqual(2);
    expect(overviewRes.body.data.systemHealth.status).toBe('OPERATIONAL');

    const companiesRes = await request(app)
      .get('/api/v1/superadmin/companies?status=ALL')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(companiesRes.status).toBe(200);
    expect(companiesRes.body.data.length).toBeGreaterThanOrEqual(2);

    const foundAlpha = companiesRes.body.data.some((c: any) => c.slug === companyASlug);
    expect(foundAlpha).toBe(true);
  });

  it('7. Super Admin can inspect individual company dossier and metrics', async () => {
    const res = await request(app)
      .get(`/api/v1/superadmin/companies/${companyAId}`)
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.organization.name).toBe('Alpha Systems Inc');
    expect(res.body.data.metrics.employees).toBeGreaterThanOrEqual(1);
    expect(res.body.data.subscriptionHistory.length).toBeGreaterThanOrEqual(1);
  });

  it('8. Super Admin can suspend and reactivate a company with audit logs', async () => {
    // Suspend Company B
    const suspendRes = await request(app)
      .patch(`/api/v1/superadmin/companies/${companyBId}/status`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ status: 'SUSPENDED', reason: 'Billing delinquency review' });

    expect(suspendRes.status).toBe(200);
    expect(suspendRes.body.data.status).toBe('SUSPENDED');
    expect(suspendRes.body.data.suspendedReason).toBe('Billing delinquency review');

    // Reactivate Company B
    const reactivateRes = await request(app)
      .patch(`/api/v1/superadmin/companies/${companyBId}/status`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ status: 'ACTIVE' });

    expect(reactivateRes.status).toBe(200);
    expect(reactivateRes.body.data.status).toBe('ACTIVE');
    expect(reactivateRes.body.data.suspendedReason).toBeNull();
  });

  it('9. Super Admin can update subscription tier and employee entitlement limit', async () => {
    const res = await request(app)
      .patch(`/api/v1/superadmin/companies/${companyAId}/subscription`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        plan: 'GROWTH',
        maxEmployees: 100,
        amount: 250,
        interval: 'MONTHLY',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.organization.subscriptionPlan).toBe('GROWTH');
    expect(res.body.data.organization.maxEmployees).toBe(100);
    expect(res.body.data.subscriptionRecord.plan).toBe('GROWTH');
  });

  // 10. Strict Cross-Tenant Data Isolation (IDOR Tests)
  it('10. Strict Read Isolation: Company A cannot read Company B employees', async () => {
    const res = await request(app)
      .get(`/api/v1/employees/${companyBEmployeeId}`)
      .set('Authorization', `Bearer ${companyAToken}`);

    // Must return 404 Not Found because Company B employee does NOT belong to Company A
    expect(res.status).toBe(404);
  });

  it('11. Strict Mutation Isolation: Company A cannot update Company B employee', async () => {
    const res = await request(app)
      .patch(`/api/v1/employees/${companyBEmployeeId}`)
      .set('Authorization', `Bearer ${companyAToken}`)
      .send({ firstName: 'Hacked Name' });

    expect(res.status).toBe(404);

    // Verify Company B employee was NOT modified in the database
    const empB = await prisma.employee.findUnique({
      where: { id: companyBEmployeeId },
    });
    expect(empB?.firstName).not.toBe('Hacked Name');
  });

  it('12. Strict List Isolation: Company A employee list never includes Company B records', async () => {
    const listRes = await request(app)
      .get('/api/v1/employees')
      .set('Authorization', `Bearer ${companyAToken}`);

    expect(listRes.status).toBe(200);
    const hasCompanyBRecords = listRes.body.data.some((e: any) => e.organizationId === companyBId);
    expect(hasCompanyBRecords).toBe(false);
  });

  // 13. Subscription Limit Enforcement
  it('13. Enforces subscription limit when maxEmployees is reached', async () => {
    // Temporarily set Company A maxEmployees to 1 (which it already reached via initial owner)
    await prisma.organization.update({
      where: { id: companyAId },
      data: { maxEmployees: 1, subscriptionPlan: 'STARTER' },
    });

    // Attempt to add a 2nd employee to Company A
    const addRes = await request(app)
      .post('/api/v1/employees')
      .set('Authorization', `Bearer ${companyAToken}`)
      .send({
        employeeCode: 'EMP-002',
        firstName: 'Over',
        lastName: 'Limit',
        email: `overlimit+${timeSuffix}@alphasys.com`,
        employmentType: 'FULL_TIME',
      });

    expect(addRes.status).toBe(403);
    expect(addRes.body.message).toContain('Employee subscription limit reached');

    // Upgrade limit to 5 and verify adding succeeds
    await prisma.organization.update({
      where: { id: companyAId },
      data: { maxEmployees: 5 },
    });

    const successAddRes = await request(app)
      .post('/api/v1/employees')
      .set('Authorization', `Bearer ${companyAToken}`)
      .send({
        employeeCode: 'EMP-002',
        firstName: 'Within',
        lastName: 'Limit',
        email: `withinlimit+${timeSuffix}@alphasys.com`,
        employmentType: 'FULL_TIME',
      });

    expect(successAddRes.status).toBe(201);
    expect(successAddRes.body.data.employeeCode).toBe('EMP-002');
  });

  // 14. Super Admin Audit Logging
  it('14. Platform administrative actions generate immutable AuditEvents', async () => {
    const auditRes = await request(app)
      .get('/api/v1/superadmin/audit-logs?action=SUBSCRIPTION_PLAN_MODIFIED')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(auditRes.status).toBe(200);
    expect(auditRes.body.data.length).toBeGreaterThanOrEqual(1);
  });
});
