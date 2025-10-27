'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Добавляем шаблоны ежедневных кейсов для разных уровней подписки, включая бонусный кейс
    await queryInterface.bulkInsert('case_templates', [
      {
        id: '11111111-1111-1111-1111-111111111111',
        name: 'Ежедневный кейс - Бесплатный',
        description: 'Ежедневный кейс для пользователей без подписки',
        image_url: '/images/cases/free.png',
        type: 'daily',
        min_subscription_tier: 0,
        cooldown_hours: 0.003, // ~10 секунд (было 24 часа)
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: '22222222-2222-2222-2222-222222222222',
        name: 'Ежедневный кейс - Статус',
        description: 'Ежедневный кейс для подписчиков уровня Статус',
        image_url: '/images/cases/status.png',
        type: 'daily',
        min_subscription_tier: 1,
        cooldown_hours: 0.003, // ~10 секунд (было 24 часа)
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: '33333333-3333-3333-3333-333333333333',
        name: 'Ежедневный кейс - Статус+',
        description: 'Ежедневный кейс для подписчиков уровня Статус+',
        image_url: '/images/cases/+.png',
        type: 'daily',
        min_subscription_tier: 2,
        cooldown_hours: 0.003, // ~10 секунд (было 24 часа)
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: '44444444-4444-4444-4444-444444444444',
        name: 'Ежедневный кейс - Статус++',
        description: 'Ежедневный кейс для подписчиков уровня Статус++',
        image_url: '/images/cases/++.png',
        type: 'daily',
        min_subscription_tier: 3,
        cooldown_hours: 0.003, // ~10 секунд (было 24 часа)
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: '55555555-5555-5555-5555-555555555555',
        name: 'Бонусный кейс',
        description: 'Кейс, получаемый в бонусной игре',
        image_url: '/images/cases/bonus.png',
        type: 'special',
        min_subscription_tier: 0,
        cooldown_hours: 0,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: '66666666-6666-6666-6666-666666666666',
        name: 'Стандартный кейс',
        description: 'Стандартный кейс с хорошими предметами',
        image_url: '/images/cases/99.png',
        type: 'premium',
        min_subscription_tier: 0,
        price: 99,
        cooldown_hours: 0,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: '77777777-7777-7777-7777-777777777777',
        name: 'Премиум кейс',
        description: 'Премиум кейс с редкими и дорогими предметами',
        image_url: '/images/cases/499.png',
        type: 'premium',
        min_subscription_tier: 0,
        price: 499,
        cooldown_hours: 0,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      }
    ], {});
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('case_templates', {
      id: [
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
        '33333333-3333-3333-3333-333333333333',
        '44444444-4444-4444-4444-444444444444',
        '55555555-5555-5555-5555-555555555555',
        '66666666-6666-6666-6666-666666666666',
        '77777777-7777-7777-7777-777777777777'
      ]
    }, {});
  }
};
