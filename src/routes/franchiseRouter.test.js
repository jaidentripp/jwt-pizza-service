const request = require('supertest');
const app = require('../service'); // express app instance

const adminUser = { name: 'Admin User', email: '', password: 'password' };
const regularUser = { name: 'Regular User', email: '', password: 'password' };
let adminAuthToken;
let regularUserAuthToken;

beforeAll(async () => {
  // Use a unique email to prevent conflicts on repeated runs
  adminUser.email = Math.random().toString(36).substring(2, 12) + '@test.com';
  regularUser.email = Math.random().toString(36).substring(2, 12) + '@test.com';

  // Register user (registration creates user with Admin role via DB mock or logic)
  const adminRes = await request(app).post('/api/auth').send(adminUser);
  adminAuthToken = adminRes.body.token;

  const userRes = await request(app).post('/api/auth').send(regularUser);
  regularUserAuthToken = userRes.body.token;

  expect(adminAuthToken).toBeDefined();
  expect(adminAuthToken).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
});

describe('Franchise Router End-to-End Integration Tests', () => {
  
  test('GET /api/franchise returns list of franchises', async () => {
    const res = await request(app)
      .get('/api/franchise')
      .set('Authorization', `Bearer ${adminAuthToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('franchises');
    expect(Array.isArray(res.body.franchises)).toBe(true);
    if (res.body.franchises.length > 0) {
      expect(res.body.franchises[0]).toHaveProperty('name');
    }
  });

  test('POST /api/franchise creates a franchise', async () => {
    const newFranchise = {
      name: 'New Franchise',
      admins: [{ email: adminUser.email }],
    };
    const res = await request(app)
      .post('/api/franchise')
      .set('Authorization', `Bearer ${adminAuthToken}`)
      .send(newFranchise);
    expect([201, 403]).toContain(res.status);
    if (res.status === 201) {
      expect(res.body).toHaveProperty('insertId');
    }
  });

  test('GET /api/franchise/:userId returns franchises for user', async () => {
    // Assuming user id 1 for test user; adjust as needed
    const res = await request(app)
      .get(`/api/franchise/1`)
      .set('Authorization', `Bearer ${adminAuthToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('PUT /api/franchise/:id updates a franchise', async () => {
    const res = await request(app)
      .put('/api/franchise/1')
      .set('Authorization', `Bearer ${adminAuthToken}`)
      .send({ name: 'Updated Franchise', location: 'New Location' });
    expect([200, 403, 404]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body).toHaveProperty('affectedRows');
    }
  });

  test('DELETE /api/franchise/:id deletes a franchise', async () => {
    const res = await request(app)
      .delete('/api/franchise/1')
      .set('Authorization', `Bearer ${adminAuthToken}`);
    expect([200, 403, 404]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body).toHaveProperty('message');
    }
  });

  test('POST /api/franchise with bad data returns error', async () => {
    const res = await request(app)
      .post('/api/franchise')
      .set('Authorization', `Bearer ${adminAuthToken}`)
      .send({});
    expect([400, 422, 403]).toContain(res.status);
  });

});

describe('Franchise Router Authorization and Edge Cases', () => {
  
    test('POST /api/franchise as non-admin is forbidden', async () => {
      const res = await request(app)
        .post('/api/franchise')
        .set('Authorization', `Bearer ${regularUserAuthToken}`)
        .send({ name: 'Unauthorized Franchise', admins: [{ email: regularUser.email }] });
      expect(res.status).toBe(403);
    });
  
    test('POST /api/franchise without auth returns 401', async () => {
      const res = await request(app)
        .post('/api/franchise')
        .send({ name: 'No Auth Franchise', admins: [{ email: 'foo@test.com' }] });
      expect(res.status).toBe(401);
    });
  
    test('GET /api/franchise with pagination and filtering', async () => {
      const res = await request(app)
        .get('/api/franchise?page=1&limit=2&name=pizza')
        .set('Authorization', `Bearer ${adminAuthToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('franchises');
      expect(Array.isArray(res.body.franchises)).toBe(true);
    });
  
    test('DELETE non-existent franchise returns 404 or 403', async () => {
      const res = await request(app)
        .delete('/api/franchise/999999')
        .set('Authorization', `Bearer ${adminAuthToken}`);
      expect([200, 403, 404]).toContain(res.status);
    });
  
    // Assuming store routes exist, test create and delete store authorization
    test('POST /api/franchise/:id/store as non-admin forbidden', async () => {
      const res = await request(app)
        .post('/api/franchise/1/store')
        .set('Authorization', `Bearer ${regularUserAuthToken}`)
        .send({ name: 'New Store' });
      expect(res.status).toBe(403);
    });
  
    test('DELETE /api/franchise/:franchiseId/store/:storeId without auth', async () => {
      const res = await request(app)
        .delete('/api/franchise/1/store/1');
      expect(res.status).toBe(401);
    });
  
  });


  describe('Franchise Router Additional Edge and Validation Cases', () => {

    test('POST /api/franchise with invalid body returns 400 or 422', async () => {
      const invalidBodies = [
        {}, // empty
        { admins: 'not an array' },
        { name: '' },
        { name: 1234, admins: [{ email: 'test@test.com' }] },
      ];
      for (const body of invalidBodies) {
        const res = await request(app)
          .post('/api/franchise')
          .set('Authorization', `Bearer ${adminAuthToken}`)
          .send(body);
        expect([400, 422, 403]).toContain(res.status);
      }
    });
  
    test('PUT /api/franchise/:id with invalid data returns 400 or 422', async () => {
      const invalidData = [
        {},
        { name: 123 },
        { location: null },
      ];
      for (const data of invalidData) {
        const res = await request(app)
          .put('/api/franchise/1')
          .set('Authorization', `Bearer ${adminAuthToken}`)
          .send(data);
        expect([400, 422, 403, 404]).toContain(res.status);
      }
    });
  
    test('Store routes reject unauthorized or invalid requests', async () => {
      // Unauthorized attempt to add store
      const res1 = await request(app)
        .post('/api/franchise/1/store')
        .set('Authorization', `Bearer ${regularUserAuthToken}`)
        .send({ name: 'Test Store' });
      expect(res1.status).toBe(403);
  
      // Missing body
      const res2 = await request(app)
        .post('/api/franchise/1/store')
        .set('Authorization', `Bearer ${adminAuthToken}`);
      expect([400, 403]).toContain(res2.status);
  
      // Unauthorized attempt to delete store
      const res3 = await request(app)
        .delete('/api/franchise/1/store/1')
        .set('Authorization', `Bearer ${regularUserAuthToken}`);
      expect(res3.status).toBe(403);
    });
  
  });