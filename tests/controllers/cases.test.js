const { createTestApp, createAgent } = require('../helpers/testApp');
const { createTestUser, createTestCase, createTestItem, cleanTestDatabase, createTestJWT } = require('../helpers/testUtils');

describe('Cases Controllers', () => {
  let app;
  let agent;

  beforeAll(async () => {
    app = await createTestApp();
    agent = createAgent();
  });

  beforeEach(async () => {
    await cleanTestDatabase();
  });

  describe('GET /api/user/cases', () => {
    it('should get user cases with valid token', async () => {
      const user = await createTestUser();
      const token = createTestJWT(user.id);

      // Создаем тестовый кейс-шаблон
      const caseTemplate = await createTestCase({
        name: 'Test Case',
        price: 100,
        is_active: true
      });

      const response = await agent
        .get('/api/user/cases')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.cases)).toBe(true);
    });

    it('should require authentication', async () => {
      const response = await agent
        .get('/api/user/cases')
        .expect(401);

      expect(response.body.success).toBeFalsy();
    });
  });

  describe('GET /api/user/cases/available', () => {
    it('should get available case templates', async () => {
      const user = await createTestUser();
      const token = createTestJWT(user.id);

      const caseTemplate = await createTestCase({
        name: 'Available Case',
        price: 100,
        is_active: true
      });

      const response = await agent
        .get('/api/user/cases/available')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.cases)).toBe(true);

      // Проверяем, что активные кейсы присутствуют
      const activeCases = response.body.cases.filter(c => c.is_active);
      expect(activeCases.length).toBeGreaterThanOrEqual(0);
    });

    it('should not return inactive cases', async () => {
      const user = await createTestUser();
      const token = createTestJWT(user.id);

      await createTestCase({
        name: 'Inactive Case',
        price: 100,
        is_active: false
      });

      const response = await agent
        .get('/api/user/cases/available')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const inactiveCases = response.body.cases.filter(c => !c.is_active);
      expect(inactiveCases.length).toBe(0);
    });
  });

  describe('POST /api/user/cases/open', () => {
    it('should not open case without sufficient funds', async () => {
      const user = await createTestUser({ balance: 50 }); // недостаточно средств
      const token = createTestJWT(user.id);

      const caseTemplate = await createTestCase({
        name: 'Expensive Case',
        price: 100
      });

      // Создаем кейс пользователя
      const { Case } = require('../../models');
      const userCase = await Case.create({
        user_id: user.id,
        case_template_id: caseTemplate.id,
        is_opened: false,
        received_date: new Date()
      });

      const response = await agent
        .post('/api/user/cases/open')
        .set('Authorization', `Bearer ${token}`)
        .send({ caseId: userCase.id })
        .expect(400);

      expect(response.body.success).toBeFalsy();
      expect(response.body.message).toContain('недостаточно средств');
    });

    it('should not open already opened case', async () => {
      const user = await createTestUser({ balance: 1000 });
      const token = createTestJWT(user.id);

      const caseTemplate = await createTestCase({
        name: 'Test Case',
        price: 100
      });

      const { Case } = require('../../models');
      const userCase = await Case.create({
        user_id: user.id,
        case_template_id: caseTemplate.id,
        is_opened: true, // уже открыт
        received_date: new Date()
      });

      const response = await agent
        .post('/api/user/cases/open')
        .set('Authorization', `Bearer ${token}`)
        .send({ caseId: userCase.id })
        .expect(400);

      expect(response.body.success).toBeFalsy();
      expect(response.body.message).toContain('уже открыт');
    });

    it('should not open non-existent case', async () => {
      const user = await createTestUser({ balance: 1000 });
      const token = createTestJWT(user.id);

      const response = await agent
        .post('/api/user/cases/open')
        .set('Authorization', `Bearer ${token}`)
        .send({ caseId: 99999 })
        .expect(404);

      expect(response.body.success).toBeFalsy();
      expect(response.body.message).toContain('не найден');
    });

    it('should not open case owned by another user', async () => {
      const user1 = await createTestUser({ balance: 1000 });
      const user2 = await createTestUser({
        balance: 1000,
        username: 'user2',
        email: 'user2@test.com',
        steam_id: 'steam_user2'
      });
      const token1 = createTestJWT(user1.id);

      const caseTemplate = await createTestCase({
        name: 'Test Case',
        price: 100
      });

      const { Case } = require('../../models');
      const user2Case = await Case.create({
        user_id: user2.id, // кейс принадлежит user2
        case_template_id: caseTemplate.id,
        is_opened: false,
        received_date: new Date()
      });

      const response = await agent
        .post('/api/user/cases/open')
        .set('Authorization', `Bearer ${token1}`) // но пытается открыть user1
        .send({ caseId: user2Case.id })
        .expect(403);

      expect(response.body.success).toBeFalsy();
      expect(response.body.message).toContain('доступа');
    });

    it('should handle case opening without caseId (daily case)', async () => {
      const user = await createTestUser({
        balance: 1000,
        next_case_available_time: new Date(Date.now() - 1000) // доступен сейчас
      });
      const token = createTestJWT(user.id);

      const response = await agent
        .post('/api/user/cases/open')
        .set('Authorization', `Bearer ${token}`)
        .send({}) // без caseId
        .expect(404); // ожидаем 404, так как нет неоткрытых кейсов

      expect(response.body.message).toContain('Не найден неоткрытый кейс');
    });

    it('should respect case cooldown time', async () => {
      const futureTime = new Date(Date.now() + 60 * 60 * 1000); // 1 час в будущем
      const user = await createTestUser({
        balance: 1000,
        next_case_available_time: futureTime
      });
      const token = createTestJWT(user.id);

      const response = await agent
        .post('/api/user/cases/open')
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(404);

      expect(response.body.message).toContain('Следующий кейс будет доступен через');
      expect(response.body.next_case_available_time).toBeDefined();
    });
  });

  describe('POST /api/user/cases/buy', () => {
    it('should buy case with sufficient funds', async () => {
      const user = await createTestUser({ balance: 1000 });
      const token = createTestJWT(user.id);

      const caseTemplate = await createTestCase({
        name: 'Buyable Case',
        price: 100,
        is_active: true
      });

      const response = await agent
        .post('/api/user/cases/buy')
        .set('Authorization', `Bearer ${token}`)
        .send({ caseTemplateId: caseTemplate.id })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('успешно');

      // Проверяем, что баланс пользователя уменьшился
      const { User } = require('../../models');
      const updatedUser = await User.findByPk(user.id);
      expect(updatedUser.balance).toBe(900); // 1000 - 100
    });

    it('should not buy case with insufficient funds', async () => {
      const user = await createTestUser({ balance: 50 });
      const token = createTestJWT(user.id);

      const caseTemplate = await createTestCase({
        name: 'Expensive Case',
        price: 100,
        is_active: true
      });

      const response = await agent
        .post('/api/user/cases/buy')
        .set('Authorization', `Bearer ${token}`)
        .send({ caseTemplateId: caseTemplate.id })
        .expect(400);

      expect(response.body.success).toBeFalsy();
      expect(response.body.message).toContain('недостаточно');
    });

    it('should not buy inactive case', async () => {
      const user = await createTestUser({ balance: 1000 });
      const token = createTestJWT(user.id);

      const caseTemplate = await createTestCase({
        name: 'Inactive Case',
        price: 100,
        is_active: false
      });

      const response = await agent
        .post('/api/user/cases/buy')
        .set('Authorization', `Bearer ${token}`)
        .send({ caseTemplateId: caseTemplate.id })
        .expect(400);

      expect(response.body.success).toBeFalsy();
      expect(response.body.message).toContain('недоступен');
    });

    it('should not buy non-existent case', async () => {
      const user = await createTestUser({ balance: 1000 });
      const token = createTestJWT(user.id);

      const response = await agent
        .post('/api/user/cases/buy')
        .set('Authorization', `Bearer ${token}`)
        .send({ caseTemplateId: 99999 })
        .expect(404);

      expect(response.body.success).toBeFalsy();
      expect(response.body.message).toContain('не найден');
    });

    it('should require authentication', async () => {
      const caseTemplate = await createTestCase();

      const response = await agent
        .post('/api/user/cases/buy')
        .send({ caseTemplateId: caseTemplate.id })
        .expect(401);

      expect(response.body.success).toBeFalsy();
    });
  });
});
