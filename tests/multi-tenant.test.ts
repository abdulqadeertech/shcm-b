import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';

describe('Multi-Company SaaS Architecture & Tenant Isolation', () => {
  const testSlug = `nexus-tech-${Date.now()}`;
  let registeredToken: string;
  let registeredOrgId: string;
  let adminUserId: string;

  it('should validate workspace slug availability', async () => {
    // Check available slug
    const res = await request(app).get(`/api/v1/auth/check-slug/${testSlug}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.available).toBe(true);
    expect(res.body.data.valid).toBe(true);

    // Check invalid slug with spaces or illegal characters
    const invalidRes = await request(app).get('/api/v1/auth/check-slug/Invalid Slug!!');
    expect(invalidRes.status).toBe(200);
    expect(invalidRes.body.data.valid).toBe(false);
  });

  it('should register a new company workspace with atomic department and shift provisioning', async () => {
    const payload = {
      companyName: 'Nexus Technologies Global',
      slug: testSlug,
      adminFirstName: 'Marcus',
      adminLastName: 'Vance',
      adminEmail: `marcus.vance+${Date.now()}@nexustech.io`,
      password: 'SecurePassword123!',
      phone: '+1 555-019-2834',
      country: 'United States',
      currency: 'USD',
      timezone: 'America/New_York',
    };

    const res = await request(app)
      .post('/api/v1/auth/register-company')
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.organization.slug).toBe(testSlug);
    expect(res.body.data.user.role).toBe('ORG_ADMIN');

    registeredToken = res.body.data.token;
    registeredOrgId = res.body.data.organization.id;
    adminUserId = res.body.data.user.id;
  });

  it('should prevent duplicate registration with the same workspace slug', async () => {
    const duplicatePayload = {
      companyName: 'Another Nexus Copy',
      slug: testSlug,
      adminFirstName: 'Clone',
      adminLastName: 'User',
      adminEmail: 'clone@test.com',
      password: 'Password123!',
    };

    const res = await request(app)
      .post('/api/v1/auth/register-company')
      .send(duplicatePayload);

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('should publicly lookup workspace branding by slug for custom workspace logins', async () => {
    const res = await request(app).get(`/api/v1/auth/workspace/${testSlug}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.slug).toBe(testSlug);
    expect(res.body.data.name).toBe('Nexus Technologies Global');
  });

  it('should isolate data between tenant organizations strictly', async () => {
    // 1. Log in to default seeded company (acme-global)
    const acmeRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'sarah.jenkins@acmeglobal.com',
        password: 'Password123!',
      });
    const acmeToken = acmeRes.body.data.token;

    // 2. Query employees under newly registered Nexus company
    const nexusEmployees = await request(app)
      .get('/api/v1/employees')
      .set('Authorization', `Bearer ${registeredToken}`);

    // Nexus only has Marcus Vance (EMP-001)
    expect(nexusEmployees.status).toBe(200);
    expect(nexusEmployees.body.data.length).toBe(1);
    expect(nexusEmployees.body.data[0].employeeCode).toBe('EMP-001');
    expect(nexusEmployees.body.data[0].firstName).toBe('Marcus');

    // 3. Query employees under Acme company with Sarah Jenkins token
    const acmeEmployees = await request(app)
      .get('/api/v1/employees')
      .set('Authorization', `Bearer ${acmeToken}`);

    expect(acmeEmployees.status).toBe(200);
    expect(acmeEmployees.body.data.length).toBeGreaterThan(1);
    // Nexus employee Marcus Vance should NOT be visible in Acme Global
    const foundMarcus = acmeEmployees.body.data.some((e: any) => e.firstName === 'Marcus');
    expect(foundMarcus).toBe(false);
  });

  it('should support forgot password request safely', async () => {
    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'admin@novahcm.io' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
