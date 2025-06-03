'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Добавляем новые статусы в enum для withdrawal
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_withdrawals_status" ADD VALUE IF NOT EXISTS 'cart_added';
      ALTER TYPE "enum_withdrawals_status" ADD VALUE IF NOT EXISTS 'cart_paid';
      ALTER TYPE "enum_withdrawals_status" ADD VALUE IF NOT EXISTS 'trade_received';
      ALTER TYPE "enum_withdrawals_status" ADD VALUE IF NOT EXISTS 'trade_accepted';
    `);
  },

  down: async (queryInterface, Sequelize) => {
    // Откат не поддерживается для PostgreSQL enum - создаем новый enum без новых значений
    await queryInterface.sequelize.query(`
      CREATE TYPE "enum_withdrawals_status_old" AS ENUM(
        'pending', 'queued', 'processing', 'waiting_confirmation',
        'completed', 'failed', 'cancelled', 'rejected', 'expired'
      );

      ALTER TABLE "withdrawals" ALTER COLUMN "status" TYPE "enum_withdrawals_status_old"
      USING "status"::text::"enum_withdrawals_status_old";

      DROP TYPE "enum_withdrawals_status";
      ALTER TYPE "enum_withdrawals_status_old" RENAME TO "enum_withdrawals_status";
    `);
  }
};
