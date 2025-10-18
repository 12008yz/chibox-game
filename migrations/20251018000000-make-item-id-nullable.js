'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Делаем item_id nullable, так как для кейсов это поле не используется
    await queryInterface.changeColumn('user_inventory', 'item_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: 'items',
        key: 'id'
      }
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Откатываем изменения (делаем NOT NULL)
    // ВНИМАНИЕ: откат может не сработать если в таблице есть записи с NULL
    await queryInterface.changeColumn('user_inventory', 'item_id', {
      type: Sequelize.UUID,
      allowNull: false,
      references: {
        model: 'items',
        key: 'id'
      }
    });
  }
};
