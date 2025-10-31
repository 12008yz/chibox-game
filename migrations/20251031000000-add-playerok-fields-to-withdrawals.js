'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Добавляем новые статусы для PlayerOk арбитража
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_withdrawals_status" ADD VALUE IF NOT EXISTS 'searching_on_playerok';
      ALTER TYPE "enum_withdrawals_status" ADD VALUE IF NOT EXISTS 'found_on_playerok';
      ALTER TYPE "enum_withdrawals_status" ADD VALUE IF NOT EXISTS 'purchasing_on_playerok';
      ALTER TYPE "enum_withdrawals_status" ADD VALUE IF NOT EXISTS 'purchased_on_playerok';
      ALTER TYPE "enum_withdrawals_status" ADD VALUE IF NOT EXISTS 'trade_sent_to_user';
      ALTER TYPE "enum_withdrawals_status" ADD VALUE IF NOT EXISTS 'waiting_user_accept';
    `);

    // Добавляем поля для PlayerOk
    await queryInterface.addColumn('withdrawals', 'playerok_order_id', {
      type: Sequelize.STRING(255),
      allowNull: true,
      comment: 'ID заказа на PlayerOk'
    });

    await queryInterface.addColumn('withdrawals', 'playerok_price', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Цена покупки на PlayerOk (без комиссии)'
    });

    await queryInterface.addColumn('withdrawals', 'playerok_fee', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Комиссия PlayerOk (обычно 5%)'
    });

    await queryInterface.addColumn('withdrawals', 'playerok_total_cost', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Полная стоимость на PlayerOk (цена + комиссия)'
    });

    await queryInterface.addColumn('withdrawals', 'steam_market_price', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Актуальная цена Steam Market на момент покупки'
    });

    await queryInterface.addColumn('withdrawals', 'chibox_item_price', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Цена предмета в ChiBox для пользователя'
    });

    await queryInterface.addColumn('withdrawals', 'arbitrage_profit', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Прибыль с арбитража (разница между ChiBox и PlayerOk)'
    });

    await queryInterface.addColumn('withdrawals', 'arbitrage_margin_percent', {
      type: Sequelize.DECIMAL(5, 2),
      allowNull: true,
      comment: 'Процент маржи арбитража'
    });

    await queryInterface.addColumn('withdrawals', 'playerok_seller', {
      type: Sequelize.STRING(255),
      allowNull: true,
      comment: 'Продавец на PlayerOk'
    });

    await queryInterface.addColumn('withdrawals', 'playerok_item_url', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'URL предмета на PlayerOk'
    });

    await queryInterface.addColumn('withdrawals', 'alternative_items_offered', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'JSON список альтернативных предметов (если оригинал не найден)'
    });

    await queryInterface.addColumn('withdrawals', 'purchase_method', {
      type: Sequelize.ENUM('steam_bot', 'playerok_arbitrage', 'manual'),
      allowNull: true,
      defaultValue: 'steam_bot',
      comment: 'Метод вывода предмета: через Steam бота или PlayerOk арбитраж'
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Удаляем добавленные колонки
    await queryInterface.removeColumn('withdrawals', 'playerok_order_id');
    await queryInterface.removeColumn('withdrawals', 'playerok_price');
    await queryInterface.removeColumn('withdrawals', 'playerok_fee');
    await queryInterface.removeColumn('withdrawals', 'playerok_total_cost');
    await queryInterface.removeColumn('withdrawals', 'steam_market_price');
    await queryInterface.removeColumn('withdrawals', 'chibox_item_price');
    await queryInterface.removeColumn('withdrawals', 'arbitrage_profit');
    await queryInterface.removeColumn('withdrawals', 'arbitrage_margin_percent');
    await queryInterface.removeColumn('withdrawals', 'playerok_seller');
    await queryInterface.removeColumn('withdrawals', 'playerok_item_url');
    await queryInterface.removeColumn('withdrawals', 'alternative_items_offered');
    await queryInterface.removeColumn('withdrawals', 'purchase_method');

    // Удаляем ENUM для purchase_method
    await queryInterface.sequelize.query(`
      DROP TYPE IF EXISTS "enum_withdrawals_purchase_method";
    `);
  }
};
