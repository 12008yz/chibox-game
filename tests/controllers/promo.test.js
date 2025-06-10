const { createTestApp, createAgent } = require('../helpers/testApp');
const { createTestUser, createTestPromoCode, cleanTestDatabase, createTestJWT } = require('../helpers/testUtils');

describe('Promo Code Controllers', () => {
  let app;
  let agent;

  beforeAll(async () => {
    app = await createTestApp();
    agent = createAgent();
  });

  beforeEach(async () => {
    await cleanTestDatabase();
  });

  describe('POST /api/user/promo/apply', () => {
    it('should apply valid balance promo code', async () => {
      const user = await createTestUser({ balance: 100 });
      const token = createTestJWT(user.id);

      const promoCode = await createTestPromoCode({
        code: 'BALANCE100',
        type: 'balance',
        value: 100,
        usage_limit: 10,
        used_count: 0,
        is_active: true
      });

      const response = await agent
        .post('/api/user/promo/apply')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: 'BALANCE100' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('успешно');
      expect(response.body.reward).toBeDefined();
      expect(response.body.newBalance).toBe(200); // 100 + 100

      // Проверяем, что баланс пользователя увеличился
      const { User } = require('../../models');
      const updatedUser = await User.findByPk(user.id);
      expect(updatedUser.balance).toBe(200);
    });

    it('should apply valid percentage promo code', async () => {
      const user = await createTestUser({ balance: 100 });
      const token = createTestJWT(user.id);

      const promoCode = await createTestPromoCode({
        code: 'PERCENT50',
        type: 'percentage',
        value: 50, // 50% бонус
        usage_limit: 10,
        used_count: 0,
        is_active: true
      });

      const response = await agent
        .post('/api/user/promo/apply')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: 'PERCENT50' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('успешно');
      expect(response.body.newBalance).toBe(150); // 100 + (100 * 0.5)
    });

    it('should not apply invalid promo code', async () => {
      const user = await createTestUser();
      const token = createTestJWT(user.id);

      const response = await agent
        .post('/api/user/promo/apply')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: 'INVALID_CODE' })
        .expect(404);

      expect(response.body.success).toBeFalsy();
      expect(response.body.message).toContain('не найден');
    });

    it('should not apply expired promo code', async () => {
      const user = await createTestUser();
      const token = createTestJWT(user.id);

      const expiredPromo = await createTestPromoCode({
        code: 'EXPIRED',
        type: 'balance',
        value: 100,
        expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000), // истек вчера
        is_active: true
      });

      const response = await agent
        .post('/api/user/promo/apply')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: 'EXPIRED' })
        .expect(400);

      expect(response.body.success).toBeFalsy();
      expect(response.body.message).toContain('истек');
    });

    it('should not apply inactive promo code', async () => {
      const user = await createTestUser();
      const token = createTestJWT(user.id);

      const inactivePromo = await createTestPromoCode({
        code: 'INACTIVE',
        type: 'balance',
        value: 100,
        is_active: false
      });

      const response = await agent
        .post('/api/user/promo/apply')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: 'INACTIVE' })
        .expect(400);

      expect(response.body.success).toBeFalsy();
      expect(response.body.message).toContain('неактивен');
    });

    it('should not apply promo code if usage limit exceeded', async () => {
      const user = await createTestUser();
      const token = createTestJWT(user.id);

      const limitedPromo = await createTestPromoCode({
        code: 'LIMITED',
        type: 'balance',
        value: 100,
        usage_limit: 1,
        used_count: 1, // уже использован максимальное количество раз
        is_active: true
      });

      const response = await agent
        .post('/api/user/promo/apply')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: 'LIMITED' })
        .expect(400);

      expect(response.body.success).toBeFalsy();
      expect(response.body.message).toContain('исчерпан');
    });

    it('should not allow same user to use promo code twice', async () => {
      const user = await createTestUser({ balance: 100 });
      const token = createTestJWT(user.id);

      const promoCode = await createTestPromoCode({
        code: 'ONCE_PER_USER',
        type: 'balance',
        value: 100,
        usage_limit: 10,
        used_count: 0,
        is_active: true
      });

      // Первое использование должно быть успешным
      await agent
        .post('/api/user/promo/apply')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: 'ONCE_PER_USER' })
        .expect(200);

      // Второе использование должно быть отклонено
      const response = await agent
        .post('/api/user/promo/apply')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: 'ONCE_PER_USER' })
        .expect(400);

      expect(response.body.success).toBeFalsy();
      expect(response.body.message).toContain('уже использовали');
    });

    it('should validate required fields', async () => {
      const user = await createTestUser();
      const token = createTestJWT(user.id);

      const response = await agent
        .post('/api/user/promo/apply')
        .set('Authorization', `Bearer ${token}`)
        .send({}) // без кода
        .expect(400);

      expect(response.body.success).toBeFalsy();
      expect(response.body.message).toContain('обязателен');
    });

    it('should handle subscription promo codes', async () => {
      const user = await createTestUser({ subscription_days_left: 0 });
      const token = createTestJWT(user.id);

      const subscriptionPromo = await createTestPromoCode({
        code: 'SUB30',
        type: 'subscription',
        value: 30, // 30 дней подписки
        usage_limit: 10,
        used_count: 0,
        is_active: true
      });

      const response = await agent
        .post('/api/user/promo/apply')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: 'SUB30' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.reward).toContain('30 дней подписки');

      // Проверяем, что дни подписки добавились
      const { User } = require('../../models');
      const updatedUser = await User.findByPk(user.id);
      expect(updatedUser.subscription_days_left).toBe(30);
    });

    it('should require authentication', async () => {
      const promoCode = await createTestPromoCode();

      const response = await agent
        .post('/api/user/promo/apply')
        .send({ code: promoCode.code })
        .expect(401);

      expect(response.body.success).toBeFalsy();
    });

    it('should be case insensitive', async () => {
      const user = await createTestUser({ balance: 100 });
      const token = createTestJWT(user.id);

      const promoCode = await createTestPromoCode({
        code: 'TESTCODE',
        type: 'balance',
        value: 50,
        is_active: true
      });

      // Тестируем с разным регистром
      const response = await agent
        .post('/api/user/promo/apply')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: 'testcode' }) // нижний регистр
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should handle special characters in promo code', async () => {
      const user = await createTestUser({ balance: 100 });
      const token = createTestJWT(user.id);

      const promoCode = await createTestPromoCode({
        code: 'TEST-2024_SPECIAL',
        type: 'balance',
        value: 50,
        is_active: true
      });

      const response = await agent
        .post('/api/user/promo/apply')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: 'TEST-2024_SPECIAL' })
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });
});
