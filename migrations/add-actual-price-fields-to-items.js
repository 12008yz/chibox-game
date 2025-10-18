'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableDescription = await queryInterface.describeTable('items');

    if (!tableDescription.actual_price_rub) {
      await queryInterface.addColumn('items', 'actual_price_rub', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        comment: 'Актуальная цена из Steam Market в рублях'
      });
    }

    if (!tableDescription.price_last_updated) {
      await queryInterface.addColumn('items', 'price_last_updated', {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Время последнего обновления цены'
      });
    }

    if (!tableDescription.price_source) {
      await queryInterface.addColumn('items', 'price_source', {
        type: Sequelize.STRING(50),
        allowNull: true,
        defaultValue: 'static',
        comment: 'Источник цены: steam_api, fallback, static'
      });
    }

    // Добавляем индекс для быстрого поиска по времени обновления
    try {
      await queryInterface.addIndex('items', ['price_last_updated'], {
        name: 'idx_items_price_last_updated'
      });
    } catch (e) {
      // Индекс уже существует
    }

    // Добавляем индекс для поиска по источнику цены
    try {
      await queryInterface.addIndex('items', ['price_source'], {
        name: 'idx_items_price_source'
      });
    } catch (e) {
      // Индекс уже существует
    }

    console.log('✅ Добавлены поля для актуальных цен Steam Market');
  },

  down: async (queryInterface, Sequelize) => {
    try {
      await queryInterface.removeIndex('items', 'idx_items_price_last_updated');
    } catch (e) {}

    try {
      await queryInterface.removeIndex('items', 'idx_items_price_source');
    } catch (e) {}

    const tableDescription = await queryInterface.describeTable('items');

    if (tableDescription.actual_price_rub) {
      await queryInterface.removeColumn('items', 'actual_price_rub');
    }

    if (tableDescription.price_last_updated) {
      await queryInterface.removeColumn('items', 'price_last_updated');
    }

    if (tableDescription.price_source) {
      await queryInterface.removeColumn('items', 'price_source');
    }

    console.log('✅ Удалены поля актуальных цен Steam Market');
  }
};
