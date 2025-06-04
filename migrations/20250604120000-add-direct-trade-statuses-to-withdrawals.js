'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Добавляем новые статусы к существующему ENUM
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_withdrawals_status"
      ADD VALUE IF NOT EXISTS 'direct_trade_pending';
    `);

    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_withdrawals_status"
      ADD VALUE IF NOT EXISTS 'direct_trade_sent';
    `);

    console.log('Добавлены новые статусы для прямых trade offers: direct_trade_pending, direct_trade_sent');
  },

  down: async (queryInterface, Sequelize) => {
    // PostgreSQL не поддерживает удаление значений из ENUM напрямую
    // Для отката нужно создать новый ENUM без этих значений и обновить таблицу
    console.log('Откат новых статусов direct trade требует ручного вмешательства');
    console.log('Выполните следующие SQL команды для отката:');
    console.log(`
      -- 1. Обновить все заявки с новыми статусами на 'failed'
      UPDATE withdrawals SET status = 'failed'
      WHERE status IN ('direct_trade_pending', 'direct_trade_sent');

      -- 2. Создать новый ENUM без новых статусов
      CREATE TYPE enum_withdrawals_status_old AS ENUM (
        'pending', 'queued', 'processing', 'waiting_confirmation',
        'completed', 'failed', 'cancelled', 'rejected', 'expired'
      );

      -- 3. Обновить колонку для использования старого ENUM
      ALTER TABLE withdrawals
      ALTER COLUMN status TYPE enum_withdrawals_status_old
      USING status::text::enum_withdrawals_status_old;

      -- 4. Удалить старый ENUM и переименовать новый
      DROP TYPE enum_withdrawals_status;
      ALTER TYPE enum_withdrawals_status_old RENAME TO enum_withdrawals_status;
    `);
  }
};