'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Добавляем шаблоны ежедневных кейсов для разных уровней подписки, включая бонусный кейс
    await queryInterface.bulkInsert('case_templates', [
      {
        id: '11111111-1111-1111-1111-111111111111',
        name: 'Ежедневный кейс - Бесплатный',
        description: 'Ежедневный кейс для пользователей без подписки',
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
        image_url: 'https://tempfile.aiquickdraw.com/s/475bbe22895043478fd0531dd11701c6_0_1760727687_4420.png',
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
        image_url: 'https://tempfile.aiquickdraw.com/s/ed7b0a105d3e46da9dcab0380772e4c6_0_1760726597_3944.png',
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
        image_url: 'https://tempfile.aiquickdraw.com/s/e6df1da5bc5c41eeb084b17475730c20_0_1760728419_6087.png',
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
