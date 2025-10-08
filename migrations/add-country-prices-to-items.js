'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Добавляем поля для цен по странам
    await queryInterface.addColumn('items', 'price_rub', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Цена в рублях (Россия)'
    });

    await queryInterface.addColumn('items', 'price_usd', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Цена в долларах США (международная)'
    });

    await queryInterface.addColumn('items', 'price_eur', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Цена в евро (Германия, Франция, Испания)'
    });

    await queryInterface.addColumn('items', 'price_jpy', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Цена в йенах (Япония)'
    });

    await queryInterface.addColumn('items', 'price_krw', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Цена в вонах (Корея)'
    });

    await queryInterface.addColumn('items', 'price_cny', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Цена в юанях (Китай)'
    });

    // Добавляем индексы для быстрого поиска по ценам
    await queryInterface.addIndex('items', ['price_rub'], {
      name: 'idx_items_price_rub'
    });

    await queryInterface.addIndex('items', ['price_usd'], {
      name: 'idx_items_price_usd'
    });

    await queryInterface.addIndex('items', ['price_eur'], {
      name: 'idx_items_price_eur'
    });

    console.log('✅ Добавлены поля для цен по странам');
  },

  down: async (queryInterface, Sequelize) => {
    // Удаляем индексы
    await queryInterface.removeIndex('items', 'idx_items_price_rub');
    await queryInterface.removeIndex('items', 'idx_items_price_usd');
    await queryInterface.removeIndex('items', 'idx_items_price_eur');

    // Удаляем поля цен по странам
    await queryInterface.removeColumn('items', 'price_rub');
    await queryInterface.removeColumn('items', 'price_usd');
    await queryInterface.removeColumn('items', 'price_eur');
    await queryInterface.removeColumn('items', 'price_jpy');
    await queryInterface.removeColumn('items', 'price_krw');
    await queryInterface.removeColumn('items', 'price_cny');

    console.log('✅ Удалены поля цен по странам');
  }
};
