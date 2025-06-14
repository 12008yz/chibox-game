'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('items', 'actual_price_rub', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Актуальная цена из Steam Market в рублях'
    });

    await queryInterface.addColumn('items', 'price_last_updated', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: 'Время последнего обновления цены'
    });

    await queryInterface.addColumn('items', 'price_source', {
      type: Sequelize.STRING(50),
      allowNull: true,
      defaultValue: 'static',
      comment: 'Источник цены: steam_api, fallback, static'
    });

    // Добавляем индекс для быстрого поиска по времени обновления
    await queryInterface.addIndex('items', ['price_last_updated'], {
      name: 'idx_items_price_last_updated'
    });

    // Добавляем индекс для поиска по источнику цены
    await queryInterface.addIndex('items', ['price_source'], {
      name: 'idx_items_price_source'
    });

    console.log('✅ Добавлены поля для актуальных цен Steam Market');
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeIndex('items', 'idx_items_price_last_updated');
    await queryInterface.removeIndex('items', 'idx_items_price_source');

    await queryInterface.removeColumn('items', 'actual_price_rub');
    await queryInterface.removeColumn('items', 'price_last_updated');
    await queryInterface.removeColumn('items', 'price_source');

    console.log('✅ Удалены поля актуальных цен Steam Market');
  }
};
