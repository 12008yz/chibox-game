'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Добавляем значение 'sell_item' в enum achievements.requirement_type
    await queryInterface.sequelize.query(`
      ALTER TYPE enum_achievements_requirement_type ADD VALUE IF NOT EXISTS 'sell_item';
    `);
  },

  down: async (queryInterface, Sequelize) => {
    // Откат удаления значения из enum в PostgreSQL невозможен напрямую
    // Можно оставить пустым или реализовать через пересоздание enum, если нужно
  }
};
