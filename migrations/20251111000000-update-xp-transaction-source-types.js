'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Обновляем enum для source_type в таблице xp_transactions
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_xp_transactions_source_type"
      ADD VALUE IF NOT EXISTS 'case_opening';
    `).catch(() => {});

    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_xp_transactions_source_type"
      ADD VALUE IF NOT EXISTS 'buy_case';
    `).catch(() => {});

    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_xp_transactions_source_type"
      ADD VALUE IF NOT EXISTS 'buy_subscription';
    `).catch(() => {});

    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_xp_transactions_source_type"
      ADD VALUE IF NOT EXISTS 'sell_item';
    `).catch(() => {});

    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_xp_transactions_source_type"
      ADD VALUE IF NOT EXISTS 'upgrade_success';
    `).catch(() => {});

    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_xp_transactions_source_type"
      ADD VALUE IF NOT EXISTS 'upgrade_fail';
    `).catch(() => {});

    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_xp_transactions_source_type"
      ADD VALUE IF NOT EXISTS 'withdraw_item';
    `).catch(() => {});

    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_xp_transactions_source_type"
      ADD VALUE IF NOT EXISTS 'deposit';
    `).catch(() => {});
  },

  down: async (queryInterface, Sequelize) => {
    // PostgreSQL не поддерживает удаление значений из enum
    // Поэтому просто оставляем комментарий
    // Если нужно откатить - придется пересоздавать enum полностью
    console.log('Cannot remove enum values in PostgreSQL');
  }
};
