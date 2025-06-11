'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const levels = [
      {
        id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        level: 1,
        xp_required: 0,
        xp_to_next_level: 100,
        bonus_percentage: 0,
        daily_cases_bonus: 0,
        is_milestone: false,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        level: 2,
        xp_required: 100,
        xp_to_next_level: 200,
        bonus_percentage: 1,
        daily_cases_bonus: 1,
        is_milestone: false,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        level: 3,
        xp_required: 300,
        xp_to_next_level: 400,
        bonus_percentage: 2,
        daily_cases_bonus: 1,
        is_milestone: false,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
        level: 4,
        xp_required: 700,
        xp_to_next_level: 600,
        bonus_percentage: 3,
        daily_cases_bonus: 2,
        is_milestone: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
        level: 5,
        xp_required: 1300,
        xp_to_next_level: 800,
        bonus_percentage: 4,
        daily_cases_bonus: 2,
        is_milestone: false,
        created_at: new Date(),
        updated_at: new Date()
      }
    ];

    await queryInterface.bulkInsert('level_settings', levels, {});
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('level_settings', null, {});
  }
};
