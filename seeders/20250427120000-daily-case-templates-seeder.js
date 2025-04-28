'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Добавляем шаблоны ежедневных кейсов для разных уровней подписки
    await queryInterface.bulkInsert('case_templates', [
      {
        id: '11111111-1111-1111-1111-111111111111',
        name: 'Ежедневный кейс - Бесплатный',
        description: 'Ежедневный кейс для пользователей без подписки',
        type: 'daily',
        min_subscription_tier: 0,
        cooldown_hours: 24,
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
        cooldown_hours: 24,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: '33333333-3333-3333-3333-333333333333',
        name: 'Ежедневный кейс - Статус+',
        description: 'Ежедневный кейс для подписчиков уровня Статус+',
        type: 'daily',
        min_subscription_tier: 2,
        cooldown_hours: 24,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: '44444444-4444-4444-4444-444444444444',
        name: 'Ежедневный кейс - Статус++',
        description: 'Ежедневный кейс для подписчиков уровня Статус++',
        type: 'daily',
        min_subscription_tier: 3,
        cooldown_hours: 24,
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
        '44444444-4444-4444-4444-444444444444'
      ]
    }, {});
  }
};
