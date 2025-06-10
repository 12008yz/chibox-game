const { createTestApp, createAgent } = require('../helpers/testApp');
const { createTestUser, cleanTestDatabase, createTestJWT } = require('../helpers/testUtils');
const argon2 = require('argon2');

describe('Authentication Controllers', () => {
  let app;
  let agent;

  beforeAll(async () => {
    app = await createTestApp();
    agent = createAgent();
  });

  beforeEach(async () => {
    await cleanTestDatabase();
  });

  describe('POST /api/user/login', () => {
    let testUser;
    const testPassword = 'testPassword123';

    beforeEach(async () => {
      const hashedPassword = await argon2.hash(testPassword);
      testUser = await createTestUser({
        email: 'test@example.com',
        username: 'testuser',
        password: hashedPassword
      });
    });

    it('should login with valid credentials', async () => {
      const response = await agent
        .post('/api/user/login')
        .send({
          email: 'test@example.com',
          password: testPassword
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.token).toBeDefined();
      expect(response.body.user).toBeDefined();
      expect(response.body.user.email).toBe('test@example.com');
      expect(response.body.user.username).toBe('testuser');
      expect(response.body.user.password).toBeUndefined(); // password should not be returned
    });

    it('should not login with invalid email', async () => {
      const response = await agent
        .post('/api/user/login')
        .send({
          email: 'wrong@example.com',
          password: testPassword
        })
        .expect(401);

      expect(response.body.success).toBeFalsy();
      expect(response.body.message).toBe('Неверный email или пароль.');
    });

    it('should not login with invalid password', async () => {
      const response = await agent
        .post('/api/user/login')
        .send({
          email: 'test@example.com',
          password: 'wrongPassword'
        })
        .expect(401);

      expect(response.body.success).toBeFalsy();
      expect(response.body.message).toBe('Неверный email или пароль.');
    });

    it('should validate required fields', async () => {
      const response = await agent
        .post('/api/user/login')
        .send({})
        .expect(400);

      expect(response.body.message).toBe('Email и пароль обязательны и должны быть строками');
    });

    it('should validate field types', async () => {
      const response = await agent
        .post('/api/user/login')
        .send({
          email: 123,
          password: 'validPassword'
        })
        .expect(400);

      expect(response.body.message).toBe('Email и пароль обязательны и должны быть строками');
    });

    it('should validate field lengths', async () => {
      const longEmail = 'a'.repeat(250) + '@example.com';
      const response = await agent
        .post('/api/user/login')
        .send({
          email: longEmail,
          password: testPassword
        })
        .expect(400);

      expect(response.body.message).toBe('Неверный формат данных');
    });

    it('should block after 5 failed attempts', async () => {
      // Делаем 5 неудачных попыток
      for (let i = 0; i < 5; i++) {
        await agent
          .post('/api/user/login')
          .send({
            email: 'test@example.com',
            password: 'wrongPassword'
          })
          .expect(401);
      }

      // 6-я попытка должна быть заблокирована
      const response = await agent
        .post('/api/user/login')
        .send({
          email: 'test@example.com',
          password: 'wrongPassword'
        })
        .expect(429);

      expect(response.body.message).toBe('Попробуйте позже (блокировка из-за неудачных попыток)');
    });
  });

  describe('POST /api/user/register', () => {
    it('should register a new user with valid data', async () => {
      const userData = {
        username: 'newuser',
        email: 'newuser@example.com',
        password: 'validPassword123',
        steam_id: 'steam_123456789'
      };

      const response = await agent
        .post('/api/user/register')
        .send(userData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('успешно');
      expect(response.body.user).toBeDefined();
      expect(response.body.user.email).toBe(userData.email);
      expect(response.body.user.username).toBe(userData.username);
    });

    it('should not register user with existing email', async () => {
      await createTestUser({
        email: 'existing@example.com',
        username: 'existinguser'
      });

      const response = await agent
        .post('/api/user/register')
        .send({
          username: 'newuser',
          email: 'existing@example.com',
          password: 'validPassword123',
          steam_id: 'steam_123456789'
        })
        .expect(400);

      expect(response.body.success).toBeFalsy();
    });

    it('should not register user with existing username', async () => {
      await createTestUser({
        email: 'test@example.com',
        username: 'existinguser'
      });

      const response = await agent
        .post('/api/user/register')
        .send({
          username: 'existinguser',
          email: 'new@example.com',
          password: 'validPassword123',
          steam_id: 'steam_123456789'
        })
        .expect(400);

      expect(response.body.success).toBeFalsy();
    });

    it('should validate password strength', async () => {
      const response = await agent
        .post('/api/user/register')
        .send({
          username: 'newuser',
          email: 'newuser@example.com',
          password: '123', // слишком короткий пароль
          steam_id: 'steam_123456789'
        })
        .expect(400);

      expect(response.body.success).toBeFalsy();
    });

    it('should validate email format', async () => {
      const response = await agent
        .post('/api/user/register')
        .send({
          username: 'newuser',
          email: 'invalid-email', // неверный формат email
          password: 'validPassword123',
          steam_id: 'steam_123456789'
        })
        .expect(400);

      expect(response.body.success).toBeFalsy();
    });
  });

  describe('POST /api/user/logout', () => {
    it('should logout successfully with valid token', async () => {
      const user = await createTestUser();
      const token = createTestJWT(user.id);

      const response = await agent
        .post('/api/user/logout')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('успешно');
    });

    it('should return error without token', async () => {
      const response = await agent
        .post('/api/user/logout')
        .expect(401);

      expect(response.body.success).toBeFalsy();
    });

    it('should return error with invalid token', async () => {
      const response = await agent
        .post('/api/user/logout')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.success).toBeFalsy();
    });
  });
});
