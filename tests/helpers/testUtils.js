const { sequelize } = require('../../models');
const jwt = require('jsonwebtoken');
const argon2 = require('argon2');

/**
 * Создание тестового пользователя
 */
async function createTestUser(userData = {}) {
  const { User } = require('../../models');
  const { v4: uuidv4 } = require('uuid');

  // Если пароль не передан и не хэширован, создаем дефолтный хэш
  let password = userData.password;
  if (!password) {
    password = await argon2.hash('defaultTestPassword123');
  }

  const defaultData = {
    id: uuidv4(), // Явно генерируем UUID
    username: `testuser_${Date.now()}`,
    email: `test_${Date.now()}@example.com`,
    password: password,
    steam_id: `steam_${Date.now()}`,
    balance: 1000,
    level: 1,
    xp: 0,
    is_email_verified: true,
    is_active: true,
    role: 'user'
  };

  return await User.create({ ...defaultData, ...userData });
}

/**
 * Создание JWT токена для тестов
 */
function createTestJWT(userId, email = 'test@example.com', role = 'user') {
  return jwt.sign(
    { id: userId, email, role },
    process.env.JWT_SECRET || 'test-secret-key-at-least-32-characters-long',
    { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
  );
}

/**
 * Очистка тестовой базы данных
 */
async function cleanTestDatabase() {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('cleanTestDatabase can only be called in test environment');
  }

  // Очищаем только основные таблицы, которые используются в тестах
  const tablesToClean = [
    'user_achievements',
    'user_inventory',
    'promo_code_usages',
    'cases',
    'promo_codes',
    'users'
  ];

  for (const tableName of tablesToClean) {
    try {
      await sequelize.query(`DELETE FROM "${tableName}";`, { raw: true });
    } catch (error) {
      // Игнорируем ошибки для несуществующих таблиц
      console.log(`Warning: Could not clean table ${tableName}:`, error.message);
    }
  }
}

/**
 * Инициализация тестовой базы данных
 */
async function initTestDatabase() {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('initTestDatabase can only be called in test environment');
  }

  try {
    // Аутентификация с базой данных
    await sequelize.authenticate();

    // НЕ используем force: true, чтобы не пересоздавать таблицы
    // Используем существующую структуру базы данных
    console.log('Test database connected successfully');
  } catch (error) {
    console.error('Unable to connect to test database:', error);
    throw error;
  }
}

/**
 * Создание тестового кейса
 */
async function createTestCase(caseData = {}) {
  const { CaseTemplate } = require('../../models');
  const { v4: uuidv4 } = require('uuid');

  const defaultData = {
    id: uuidv4(), // Явно генерируем UUID
    name: `Test Case ${Date.now()}`,
    description: 'Test case description',
    image_url: 'http://example.com/case.jpg',
    price: 100,
    is_active: true,
    item_pool_config: {
      common: 60,
      uncommon: 25,
      rare: 10,
      epic: 4,
      legendary: 1
    }
  };

  return await CaseTemplate.create({ ...defaultData, ...caseData });
}

/**
 * Создание тестового предмета
 */
async function createTestItem(itemData = {}) {
  const { Item, ItemCategory } = require('../../models');
  const { v4: uuidv4 } = require('uuid');

  // Создаем категорию если её нет
  let category = await ItemCategory.findOne({ where: { name: 'Test Category' } });
  if (!category) {
    category = await ItemCategory.create({
      id: uuidv4(),
      name: 'Test Category',
      description: 'Test category description'
    });
  }

  const defaultData = {
    id: uuidv4(), // Явно генерируем UUID
    name: `Test Item ${Date.now()}`,
    description: 'Test item description',
    image_url: 'http://example.com/item.jpg',
    rarity: 'consumer',
    category_id: category.id,
    price: 50,
    in_stock: true,
    is_tradable: true
  };

  return await Item.create({ ...defaultData, ...itemData });
}

/**
 * Создание промокода для тестов
 */
async function createTestPromoCode(promoData = {}) {
  const { PromoCode } = require('../../models');
  const defaultData = {
    code: `TEST${Date.now()}`,
    type: 'balance',
    value: 100,
    usage_limit: 10,
    used_count: 0,
    is_active: true,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 дней
    created_by: 1
  };

  return await PromoCode.create({ ...defaultData, ...promoData });
}

/**
 * Ожидание некоторого времени (для асинхронных операций)
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  createTestUser,
  createTestJWT,
  cleanTestDatabase,
  initTestDatabase,
  createTestCase,
  createTestItem,
  createTestPromoCode,
  sleep
};
