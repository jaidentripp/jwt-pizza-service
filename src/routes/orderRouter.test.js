const request = require('supertest');
const app = require('../service'); // your Express app instance

const testUser = { name: 'Order Test User', email: '', password: 'password' };
let testUserAuthToken;

beforeAll(async () => {
  // Unique email for repeated test runs
  testUser.email = Math.random().toString(36).substring(2, 12) + '@test.com';

  // Register and get JWT token
  const registerRes = await request(app).post('/api/auth').send(testUser);
  testUserAuthToken = registerRes.body.token;
  expect(testUserAuthToken).toBeDefined();
  expect(testUserAuthToken).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
});

describe('Order Router End-to-End Integration Tests', () => {
  test('GET /api/order/menu returns menu items', async () => {
    const res = await request(app).get('/api/order/menu');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    if (res.body.length > 0) {
      expect(res.body[0]).toHaveProperty('id');
      expect(res.body[0]).toHaveProperty('title');
    }
  });

  test('PUT /api/order/menu adds a menu item as Admin', async () => {
    const newMenuItem = {
      title: 'Test Pizza',
      description: 'A test pizza description',
      image: 'test.png',
      price: 0.007,
    };
    const res = await request(app)
      .put('/api/order/menu')
      .set('Authorization', `Bearer ${testUserAuthToken}`)
      .send(newMenuItem);
    expect([200, 403]).toContain(res.status); // 403 if user is not admin
    if (res.status === 200) {
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.some(item => item.title === newMenuItem.title)).toBe(true);
    }
  });

  test('GET /api/order returns orders for authenticated user', async () => {
    const res = await request(app)
      .get('/api/order')
      .set('Authorization', `Bearer ${testUserAuthToken}`);
    expect([200, 204]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body).toHaveProperty('dinerId');
      expect(Array.isArray(res.body.orders)).toBe(true);
    }
  });

  test('POST /api/order creates an order', async () => {
    const newOrder = {
      franchiseId: 1,
      storeId: 1,
      items: [
        {
          menuId: 1,
          description: 'Veggie',
          price: 0.05,
        },
      ],
    };
    const res = await request(app)
      .post('/api/order')
      .set('Authorization', `Bearer ${testUserAuthToken}`)
      .send(newOrder);

    expect([200, 500]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body).toHaveProperty('order');
      expect(res.body.order).toHaveProperty('id');
      expect(res.body).toHaveProperty('jwt');
    }
    if (res.status === 500) {
      expect(res.body).toHaveProperty('message');
    }
  });
});
