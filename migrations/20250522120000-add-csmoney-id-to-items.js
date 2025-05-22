'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('items', 'csmoney_id', {
      type: Sequelize.BIGINT,
      allowNull: true,
      unique: true,
      comment: 'ID предмета на CSMoney'
    });
    await queryInterface.addIndex('items', ['csmoney_id']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeIndex('items', ['csmoney_id']);
    await queryInterface.removeColumn('items', 'csmoney_id');
  }
};
