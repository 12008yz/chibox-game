'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Добавляем значение 'alfabank' в enum_payments_payment_system
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_payments_payment_system" ADD VALUE IF NOT EXISTS 'alfabank';
    `);
  },

  async down(queryInterface, Sequelize) {
    // Откат невозможен напрямую для PostgreSQL ENUM
    // Необходимо пересоздать таблицу, если требуется откат
    console.log('Rollback not supported for ENUM values in PostgreSQL');
  }
};
