'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Добавляем новое значение 'free_case' в enum source
    await queryInterface.sequelize.query(`
      ALTER TYPE enum_user_inventory_source ADD VALUE IF NOT EXISTS 'free_case';
    `);
  },

  down: async (queryInterface, Sequelize) => {
    // Удаление значения из enum в PostgreSQL не поддерживается напрямую
    // Нужно пересоздать enum или оставить значение
    console.log('Удаление значения из enum не поддерживается в PostgreSQL');
  }
};
