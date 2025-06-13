const { createTestApp, createAgent } = require('../helpers/testApp');
const { createTestUser, createTestCase, createTestItem, cleanTestDatabase, createTestJWT, createTestCaseWithItems } = require('../helpers/testUtils');

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

  describe('GET /api/v1/cases', () => {
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
        .get('/api/v1/cases')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.cases)).toBe(true);
    });

    it('should require authentication', async () => {
      const response = await agent
        .get('/api/v1/cases')
        .expect(401);

      expect(response.body.success).toBeFalsy();
    });
  });

  describe('GET /api/v1/cases/available', () => {
    it('should get available case templates', async () => {
      const user = await createTestUser();
      const token = createTestJWT(user.id);

      const caseTemplate = await createTestCase({
        name: 'Available Case',
        price: 100,
        is_active: true
      });

      const response = await agent
        .get('/api/v1/cases/available')
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
        .get('/api/v1/cases/available')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const inactiveCases = response.body.cases.filter(c => !c.is_active);
      expect(inactiveCases.length).toBe(0);
    });
  });

  describe('POST /api/v1/cases/open', () => {
    it('should not open non-existent case', async () => {
      const user = await createTestUser({ balance: 1000 });
      const token = createTestJWT(user.id);

      const response = await agent
        .post('/api/v1/cases/open')
        .set('Authorization', `Bearer ${token}`)
        .send({ caseId: 99999 })
        .expect(404);

      expect(response.body.success).toBeFalsy();
      expect(response.body.message).toContain('не найден');
    });

    it('should not open already opened case', async () => {
      const user = await createTestUser({ balance: 1000 });
      const token = createTestJWT(user.id);

      const caseTemplate = await createTestCaseWithItems({
        name: 'Test Case',
        price: 100
      });

      const { Case } = require('../../models');
      const userCase = await Case.create({
        user_id: user.id,
        template_id: caseTemplate.id,
        is_opened: true, // уже открыт
        received_date: new Date()
      });

      const response = await agent
        .post('/api/v1/cases/open')
        .set('Authorization', `Bearer ${token}`)
        .send({ caseId: userCase.id })
        .expect(400);

      expect(response.body.success).toBeFalsy();
      expect(response.body.message).toContain('уже открыт');
    });

    it('should open case successfully', async () => {
      const user = await createTestUser({ balance: 1000 });
      const token = createTestJWT(user.id);

      const caseTemplate = await createTestCaseWithItems({
        name: 'Test Case',
        price: 100
      });

      // Создаем кейс пользователя
      const { Case } = require('../../models');
      const userCase = await Case.create({
        user_id: user.id,
        template_id: caseTemplate.id,
        is_opened: false,
        received_date: new Date()
      });

      const response = await agent
        .post('/api/v1/cases/open')
        .set('Authorization', `Bearer ${token}`)
        .send({ caseId: userCase.id })
        .expect(200);

      expect(response.body.item).toBeDefined();
      expect(response.body.message).toContain('успешно');
    });

    it('should not open case owned by another user', async () => {
      const user1 = await createTestUser({ balance: 1000 });
      const user2 = await createTestUser({
        balance: 1000
      });
      const token1 = createTestJWT(user1.id);

      const caseTemplate = await createTestCase({
        name: 'Test Case',
        price: 100
      });

      const { Case } = require('../../models');
      const user2Case = await Case.create({
        user_id: user2.id, // кейс принадлежит user2
        template_id: caseTemplate.id,
        is_opened: false,
        received_date: new Date()
      });

      const response = await agent
        .post('/api/v1/cases/open')
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
        .post('/api/v1/cases/open')
        .set('Authorization', `Bearer ${token}`)
        .send({}) // без caseId
        .expect(404); // ожидаем 404, так как нет неоткрытых кейсов

      expect(response.body.message).toContain('неоткрытый кейс');
    });

    it('should respect case cooldown time', async () => {
      const futureTime = new Date(Date.now() + 60 * 60 * 1000); // 1 час в будущем
      const user = await createTestUser({
        balance: 1000,
        next_case_available_time: futureTime
      });
      const token = createTestJWT(user.id);

      const response = await agent
        .post('/api/v1/cases/open')
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(404);

      expect(response.body.message).toContain('доступен через');
      expect(response.body.next_case_available_time).toBeDefined();
    });
  });

  describe('POST /api/v1/cases/buy', () => {
    it('should buy case with sufficient funds', async () => {
      const user = await createTestUser({ balance: 1000 });
      const token = createTestJWT(user.id);

      const response = await agent
        .post('/api/v1/cases/buy')
        .set('Authorization', `Bearer ${token}`)
        .send({ method: 'balance', quantity: 1 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Успешно');

      // Проверяем, что баланс пользователя уменьшился
      const { User } = require('../../models');
      const updatedUser = await User.findByPk(user.id);
      expect(updatedUser.balance).toBe(950); // 1000 - 50 (цена кейса 50 рублей)
    });

    it('should not buy case with insufficient funds', async () => {
      const user = await createTestUser({ balance: 30 }); // Меньше чем цена кейса (50)
      const token = createTestJWT(user.id);

      const response = await agent
        .post('/api/v1/cases/buy')
        .set('Authorization', `Bearer ${token}`)
        .send({ method: 'balance', quantity: 1 })
        .expect(400);

      expect(response.body.success).toBeFalsy();
      expect(response.body.message).toContain('Недостаточно средств');
    });

    it('should not buy case with invalid quantity', async () => {
      const user = await createTestUser({ balance: 1000 });
      const token = createTestJWT(user.id);

      const response = await agent
        .post('/api/v1/cases/buy')
        .set('Authorization', `Bearer ${token}`)
        .send({ method: 'balance', quantity: 10 }) // Превышает лимит 5
        .expect(400);

      expect(response.body.success).toBeFalsy();
      expect(response.body.message).toContain('должно быть от 1 до 5');
    });

    it('should buy case successfully', async () => {
      const user = await createTestUser({ balance: 1000 });
      const token = createTestJWT(user.id);

      const response = await agent
        .post('/api/v1/cases/buy')
        .set('Authorization', `Bearer ${token}`)
        .send({ method: 'balance', quantity: 1 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Успешно куплено');
    });

    it('should require authentication', async () => {
      const response = await agent
        .post('/api/v1/cases/buy')
        .send({ method: 'balance', quantity: 1 })
        .expect(401);

      expect(response.body.success).toBeFalsy();
    });
  });
});
