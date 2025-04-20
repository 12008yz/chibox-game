'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('items', 'buff_goods_id', {
      type: Sequelize.STRING,
      allowNull: true,
      comment: 'Уникальный id предмета на BUFF.163'
    });
    await queryInterface.addColumn('items', 'buff_buy_price', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Цена закупки предмета на BUFF.163 (актуальная)'
    });
    await queryInterface.addColumn('items', 'buff_sell_url', {
      type: Sequelize.STRING,
      allowNull: true,
      comment: 'Ссылка на предмет на BUFF.163'
    });
    await queryInterface.addColumn('items', 'last_buff_price_update', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: 'Дата и время последнего парсинга цены с BUFF.163'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('items', 'buff_goods_id');
    await queryInterface.removeColumn('items', 'buff_buy_price');
    await queryInterface.removeColumn('items', 'buff_sell_url');
    await queryInterface.removeColumn('items', 'last_buff_price_update');
  }
};



