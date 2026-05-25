'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Добавляем премиум кейсы с разными ценами
    await queryInterface.bulkInsert('case_templates', [
      {
        id: '88888888-8888-8888-8888-888888888888',
        name: 'Ночной дозор',
        description: 'Стартовый кейс с базовыми предметами',
        image_url: '/images/cases/dozor.png',
        type: 'premium',
        min_subscription_tier: 0,
        price: 17,
        cooldown_hours: 0,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: '99999999-9999-9999-9999-999999999999',
        name: 'Пушистый кейс',
        description: 'Кейс с улучшенными предметами',
        image_url: '/images/cases/dog.png',
        type: 'premium',
        min_subscription_tier: 0,
        price: 49,
        cooldown_hours: 0,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        name: 'Санитарный набор',
        description: 'Кейс с ценными предметами',
        image_url: '/images/cases/sanitar.png',
        type: 'premium',
        min_subscription_tier: 0,
        price: 101,
        cooldown_hours: 0,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        name: 'Платиновый кейс',
        description: 'Кейс с редкими предметами',
        image_url: '/images/cases/pantera.png',
        type: 'premium',
        min_subscription_tier: 0,
        price: 250,
        cooldown_hours: 0,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        name: 'Космический кейс',
        description: 'Кейс с высококачественными предметами',
        image_url: '/images/cases/space.png',
        type: 'premium',
        min_subscription_tier: 0,
        price: 601,
        cooldown_hours: 0,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
        name: 'Морской кейс',
        description: 'Кейс с легендарными предметами',
        image_url: '/images/cases/morskoy.png',
        type: 'premium',
        min_subscription_tier: 0,
        price: 998,
        cooldown_hours: 0,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
        name: 'Ледяной кейс',
        description: 'Кейс с мистическими предметами высшего качества',
        image_url: '/images/cases/led.png',
        type: 'premium',
        min_subscription_tier: 0,
        price: 2499,
        cooldown_hours: 0,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
        name: 'Бурый кейс',
        description: 'Эпический кейс с элитными предметами',
        image_url: '/images/cases/bear_chibox-game.ru.png',
        type: 'premium',
        min_subscription_tier: 0,
        price: 5000,
        cooldown_hours: 0,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: '10101010-1010-1010-1010-101010101010',
        name: 'Демонический кейс',
        description: 'Мифический кейс с эксклюзивными предметами',
        image_url: '/images/cases/demon.png',
        type: 'premium',
        min_subscription_tier: 0,
        price: 10000,
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
        '88888888-8888-8888-8888-888888888888',
        '99999999-9999-9999-9999-999999999999',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        'cccccccc-cccc-cccc-cccc-cccccccccccc',
        'dddddddd-dddd-dddd-dddd-dddddddddddd',
        'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
        'ffffffff-ffff-ffff-ffff-ffffffffffff',
        '10101010-1010-1010-1010-101010101010'
      ]
    }, {});
  }
};
