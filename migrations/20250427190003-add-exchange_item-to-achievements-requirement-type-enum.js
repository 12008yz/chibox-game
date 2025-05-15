'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Добавляем новое значение 'exchange_item' в enum_achievements_requirement_type
    await queryInterface.sequelize.query(`
      ALTER TYPE enum_achievements_requirement_type ADD VALUE IF NOT EXISTS 'exchange_item';
    `);
  },

  down: async (queryInterface, Sequelize) => {
    // Обратная миграция для удаления значения из enum невозможна напрямую
    // Можно оставить пустой или реализовать логику, если необходимо
  }
};
