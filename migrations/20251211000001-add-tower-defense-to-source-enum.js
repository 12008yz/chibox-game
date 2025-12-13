'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Добавляем 'tower_defense' в enum source для user_inventory
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_user_inventory_source" ADD VALUE IF NOT EXISTS 'tower_defense';
    `);
  },

  down: async (queryInterface, Sequelize) => {
    // В PostgreSQL нельзя удалить значение из enum напрямую
    // Нужно пересоздать enum, что сложно если есть данные
    // Оставляем пустым, так как это не критично для отката
    console.log('Note: Cannot remove enum value from PostgreSQL enum type directly');
  }
};

