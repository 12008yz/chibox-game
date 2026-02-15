'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_payments_payment_system" ADD VALUE IF NOT EXISTS 'unitpay';
    `);
  },

  async down(queryInterface, Sequelize) {
    console.log('Rollback not supported for ENUM values in PostgreSQL');
  }
};
