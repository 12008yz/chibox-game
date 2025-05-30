'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert('achievements', [
      {
        id: '11111111-1111-1111-1111-111111111111',
        name: 'Новичок',
        description: 'Откройте 10 кейсов',
        xp_reward: 100,
        icon_url: '/images/achievements/novice.png',
        requirement_type: 'cases_opened',
        requirement_value: 10,
        bonus_percentage: 2.5,
        min_item_price_for_bonus: 100.00,
        is_visible: true,
        category: 'beginner',
        display_order: 1,
        badge_color: '#00FF00',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: '22222222-2222-2222-2222-222222222222',
        name: 'Коллекционер',
        description: 'Найдите 5 редких предметов',
        xp_reward: 200,
        icon_url: '/images/achievements/collector.png',
        requirement_type: 'rare_items_found',
        requirement_value: 5,
        bonus_percentage: 5.0,
        min_item_price_for_bonus: 200.00,
        is_visible: true,
        category: 'collector',
        display_order: 2,
        badge_color: '#0000FF',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: '33333333-3333-3333-3333-333333333333',
        name: 'Премиум игрок',
        description: 'Найдите 3 предмета стоимостью от 100 руб',
        xp_reward: 300,
        icon_url: '/images/achievements/premium.png',
        requirement_type: 'premium_items_found',
        requirement_value: 3,
        bonus_percentage: 7.5,
        min_item_price_for_bonus: 100.00,
        is_visible: true,
        category: 'regular',
        display_order: 3,
        badge_color: '#FFD700',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: '44444444-4444-4444-4444-444444444444',
        name: 'Подписчик',
        description: 'Иметь активную подписку 30 дней подряд',
        xp_reward: 400,
        icon_url: '/images/achievements/subscriber.png',
        requirement_type: 'subscription_days',
        requirement_value: 30,
        bonus_percentage: 5.0,
        min_item_price_for_bonus: 0.00,
        is_visible: true,
        category: 'regular',
        display_order: 4,
        badge_color: '#FF4500',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: '88888888-8888-8888-8888-888888888888',
        name: 'Покупатель подписки',
        description: 'Приобрести любой уровень подписки',
        xp_reward: 150,
        icon_url: '/images/achievements/subscription_buyer.png',
        requirement_type: 'subscription_purchased',
        requirement_value: 1,
        bonus_percentage: 2.0,
        min_item_price_for_bonus: 0.00,
        is_visible: true,
        category: 'regular',
        display_order: 8,
        badge_color: '#FFA500',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: '55555555-5555-5555-5555-555555555555',
        name: 'Удачливый',
        description: 'Открыть кейс 7 дней подряд',
        xp_reward: 250,
        icon_url: '/images/achievements/lucky.png',
        requirement_type: 'daily_streak',
        requirement_value: 7,
        bonus_percentage: 2.5,
        min_item_price_for_bonus: 0.00,
        is_visible: true,
        category: 'regular',
        display_order: 5,
        badge_color: '#1E90FF',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: '66666666-6666-6666-6666-666666666666',
        name: 'Миллионер',
        description: 'Общая стоимость предметов в инвентаре 1,000,000 руб',
        xp_reward: 500,
        icon_url: '/images/achievements/millionaire.png',
        requirement_type: 'total_items_value',
        requirement_value: 1000000,
        bonus_percentage: 6.25,
        min_item_price_for_bonus: 0.00,
        is_visible: true,
        category: 'expert',
        display_order: 6,
        badge_color: '#8B0000',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: '77777777-7777-7777-7777-777777777777',
        name: 'Эксперт',
        description: 'Иметь предмет с ценой выше 50,000 руб',
        xp_reward: 600,
        icon_url: '/images/achievements/expert.png',
        requirement_type: 'best_item_value',
        requirement_value: 50000,
        bonus_percentage: 7.5,
        min_item_price_for_bonus: 0.00,
        is_visible: true,
        category: 'expert',
        display_order: 7,
        badge_color: '#4B0082',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      }
    ], {});
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('achievements', null, {});
  }
};
