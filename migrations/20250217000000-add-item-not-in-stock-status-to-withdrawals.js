'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_withdrawals_status" ADD VALUE IF NOT EXISTS 'item_not_in_stock';
    `);
  },

  async down(queryInterface, Sequelize) {
    // Удаление значения из ENUM в PostgreSQL не поддерживается без пересоздания типа
  }
};
