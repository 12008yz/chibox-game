'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Добавляем новое значение 'promo_code' в enum для типа транзакции
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_transactions_type" ADD VALUE IF NOT EXISTS 'promo_code';
    `);
  },

  async down(queryInterface, Sequelize) {
    // Удаление значения из enum сложнее - нужно пересоздать enum
    // В PostgreSQL нельзя просто удалить значение из enum

    // Создаем новый enum без 'promo_code'
    await queryInterface.sequelize.query(`
      CREATE TYPE "enum_transactions_type_new" AS ENUM (
        'balance_add',
        'balance_subtract',
        'subscription_purchase',
        'item_sale',
        'subscription_convert',
        'withdrawal_fee',
        'system',
        'referral_bonus',
        'achievement_reward',
        'bonus'
      );
    `);

    // Изменяем столбец для использования нового enum
    await queryInterface.sequelize.query(`
      ALTER TABLE "transactions"
      ALTER COLUMN "type" TYPE "enum_transactions_type_new"
      USING "type"::text::"enum_transactions_type_new";
    `);

    // Удаляем старый enum
    await queryInterface.sequelize.query(`
      DROP TYPE "enum_transactions_type";
    `);

    // Переименовываем новый enum
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_transactions_type_new" RENAME TO "enum_transactions_type";
    `);
  }
};
