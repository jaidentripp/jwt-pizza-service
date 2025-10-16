const request = require('supertest');
const app = require('../service'); // Your Express app instance

const testUser = { name: 'User Test User', email: '', password: 'password' };
let testUserAuthToken;
let createdUserId;

beforeAll(async () => {
  // Use a unique email to prevent conflicts on repeated runs
  testUser.email = Math.random().toString(36).substring(2, 12) + '@test.com';

  // Register user and obtain JWT token for authentication
  const registerRes = await request(app).post('/api/auth').send(testUser);
  testUserAuthToken = registerRes.body.token;
  createdUserId = registerRes.body.user?.id || 1; // fallback if not returned
  expect(testUserAuthToken).toBeDefined();
  expect(testUserAuthToken).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
});

describe('User Router End-to-End Integration Tests', () => {
  test('GET /api/user/me returns authenticated user data', async () => {
    const res = await request(app)
      .get('/api/user/me')
      .set('Authorization', `Bearer ${testUserAuthToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: createdUserId,
      name: testUser.name,
      email: testUser.email,
    });
    if (res.body.roles) {
      expect(Array.isArray(res.body.roles)).toBe(true);
      expect(res.body.roles[0]).toHaveProperty('role');
    }
  });

  test('PUT /api/user/:userId updates the user details', async () => {
    const updatedUserData = {
      name: 'Updated Name',
      email: testUser.email,
      password: 'newpassword',
    };
    const res = await request(app)
      .put(`/api/user/${createdUserId}`)
      .set('Authorization', `Bearer ${testUserAuthToken}`)
      .send(updatedUserData);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('user');
    expect(res.body.user).toMatchObject({
      id: createdUserId,
      name: updatedUserData.name,
      email: updatedUserData.email,
    });
    expect(res.body).toHaveProperty('token');
    expect(res.body.token).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
  });

  test('PUT /api/user/:userId returns 403 when unauthorized', async () => {
    const otherUserId = createdUserId + 1000; // different userId
    const res = await request(app)
      .put(`/api/user/${otherUserId}`)
      .set('Authorization', `Bearer ${testUserAuthToken}`)
      .send({ name: 'Malicious Update' });

    expect([403, 401]).toContain(res.status);
  });
});

//added for deliverable 5
test('list users unauthorized', async () => {
  const listUsersRes = await request(app).get('/api/user');
  expect(listUsersRes.status).toBe(401);
});

test('list users', async () => {
  const [user, userToken] = await registerUser(request(app));
  const listUsersRes = await request(app)
    .get('/api/user')
    .set('Authorization', 'Bearer ' + userToken);
  expect(listUsersRes.status).toBe(200);
});

async function registerUser(service) {
  const testUser = {
    name: 'pizza diner',
    email: `${randomName()}@test.com`,
    password: 'a',
  };
  const registerRes = await service.post('/api/auth').send(testUser);
  registerRes.body.user.password = testUser.password;

  return [registerRes.body.user, registerRes.body.token];
}

function randomName() {
  return Math.random().toString(36).substring(2, 12);
}