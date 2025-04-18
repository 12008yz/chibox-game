'use strict';
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Функция для хеширования пароля
    const hashPassword = async (password) => {
      const salt = await bcrypt.genSalt(10);
      return bcrypt.hash(password, salt);
    };

    // Создаем тестовых пользователей с разными уровнями подписки
    const users = [
      // Обычный пользователь без подписки
      {
        id: uuidv4(),
        username: 'user1',
        email: 'user1@example.com',
        password: await hashPassword('password123'),
        role: 'user',
        is_email_verified: true,
        is_active: true,
        level: 1,
        xp: 0,
        xp_to_next_level: 100,
        subscription_tier: 0, // Без подписки
        cases_available: 0,
        max_daily_cases: 1,
        drop_rate_modifier: 1.0,
        balance: 100.00,
        created_at: new Date(),
        updated_at: new Date()
      },
      // Пользователь с базовой подпиской
      {
        id: uuidv4(),
        username: 'user2',
        email: 'user2@example.com',
        password: await hashPassword('password123'),
        role: 'user',
        is_email_verified: true,
        is_active: true,
        level: 5,
        xp: 250,
        xp_to_next_level: 300,
        subscription_tier: 1, // Базовая подписка
        subscription_purchase_date: new Date(),
        subscription_expiry_date: new Date(new Date().setDate(new Date().getDate() + 30)), // +30 дней
        cases_available: 3,
        max_daily_cases: 3,
        drop_rate_modifier: 1.1,
        subscription_bonus_percentage: 3.0,
        total_drop_bonus_percentage: 3.0,
        balance: 250.00,
        created_at: new Date(),
        updated_at: new Date()
      },
      // Пользователь с продвинутой подпиской
      {
        id: uuidv4(),
        username: 'user3',
        email: 'user3@example.com',
        password: await hashPassword('password123'),
        role: 'user',
        is_email_verified: true,
        is_active: true,
        level: 10,
        xp: 500,
        xp_to_next_level: 700,
        subscription_tier: 2, // Продвинутая подписка
        subscription_purchase_date: new Date(),
        subscription_expiry_date: new Date(new Date().setDate(new Date().getDate() + 30)), // +30 дней
        cases_available: 5,
        max_daily_cases: 5,
        drop_rate_modifier: 1.2,
        subscription_bonus_percentage: 5.0,
        total_drop_bonus_percentage: 7.5, // С учетом уровня
        balance: 500.00,
        created_at: new Date(),
        updated_at: new Date()
      },
      // Пользователь с премиум подпиской
      {
        id: uuidv4(),
        username: 'user4',
        email: 'user4@example.com',
        password: await hashPassword('password123'),
        role: 'user',
        is_email_verified: true,
        is_active: true,
        level: 20,
        xp: 1200,
        xp_to_next_level: 1500,
        subscription_tier: 3, // Премиум подписка
        subscription_purchase_date: new Date(),
        subscription_expiry_date: new Date(new Date().setDate(new Date().getDate() + 30)), // +30 дней
        cases_available: 10,
        max_daily_cases: 10,
        drop_rate_modifier: 1.3,
        subscription_bonus_percentage: 10.0,
        achievements_bonus_percentage: 5.0,
        level_bonus_percentage: 5.0,
        total_drop_bonus_percentage: 20.0, // Суммарный бонус
        balance: 1000.00,
        total_cases_opened: 150,
        total_items_value: 5000.00,
        best_item_value: 500.00,
        daily_streak: 5,
        max_daily_streak: 10,
        created_at: new Date(),
        updated_at: new Date()
      },
      // Модератор
      {
        id: uuidv4(),
        username: 'moderator',
        email: 'moderator@example.com',
        password: await hashPassword('password123'),
        role: 'moderator',
        is_email_verified: true,
        is_active: true,
        level: 30,
        xp: 5000,
        xp_to_next_level: 6000,
        subscription_tier: 3, // Премиум подписка
        subscription_purchase_date: new Date(),
        subscription_expiry_date: new Date(new Date().setDate(new Date().getDate() + 365)), // +1 год
        cases_available: 100,
        max_daily_cases: 100,
        drop_rate_modifier: 1.5,
        subscription_bonus_percentage: 10.0,
        achievements_bonus_percentage: 10.0,
        level_bonus_percentage: 10.0,
        total_drop_bonus_percentage: 30.0,
        balance: 10000.00,
        created_at: new Date(),
        updated_at: new Date()
      },
      // Администратор
      {
        id: uuidv4(),
        username: 'admin',
        email: 'admin@example.com',
        password: await hashPassword('admin123'),
        role: 'admin',
        is_email_verified: true,
        is_active: true,
        level: 50,
        xp: 10000,
        xp_to_next_level: 12000,
        subscription_tier: 3,
        subscription_purchase_date: new Date(),
        subscription_expiry_date: new Date(new Date().setDate(new Date().getDate() + 3650)), // +10 лет
        cases_available: 999,
        max_daily_cases: 999,
        drop_rate_modifier: 2.0,
        subscription_bonus_percentage: 10.0,
        achievements_bonus_percentage: 20.0,
        level_bonus_percentage: 20.0,
        total_drop_bonus_percentage: 50.0,
        balance: 50000.00,
        created_at: new Date(),
        updated_at: new Date()
      }
    ];

    return queryInterface.bulkInsert('users', users);
  },

  down: async (queryInterface, Sequelize) => {
    return queryInterface.bulkDelete('users', null, {});
  }
};
