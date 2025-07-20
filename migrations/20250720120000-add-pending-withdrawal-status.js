'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Добавляем новое значение 'pending_withdrawal' в enum_user_inventory_status
    await queryInterface.sequelize.query(`
      ALTER TYPE enum_user_inventory_status ADD VALUE IF NOT EXISTS 'pending_withdrawal';
    `);
  },

  down: async (queryInterface, Sequelize) => {
    // Обратная миграция для удаления значения из enum невозможна напрямую
    // Можно оставить пустой или реализовать логику, если необходимо
  }
};
