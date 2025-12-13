'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('tower_defense_games', 'bet_item_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: 'items',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
      comment: "ID предмета, поставленного на кон"
    });

    await queryInterface.addColumn('tower_defense_games', 'bet_inventory_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: 'user_inventory',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
      comment: "ID записи инвентаря с предметом ставки"
    });

    await queryInterface.addColumn('tower_defense_games', 'reward_item_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: 'items',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
      comment: "ID предмета-награды за победу"
    });

    await queryInterface.addIndex('tower_defense_games', ['bet_item_id']);
    await queryInterface.addIndex('tower_defense_games', ['reward_item_id']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeIndex('tower_defense_games', ['reward_item_id']);
    await queryInterface.removeIndex('tower_defense_games', ['bet_item_id']);
    await queryInterface.removeColumn('tower_defense_games', 'reward_item_id');
    await queryInterface.removeColumn('tower_defense_games', 'bet_inventory_id');
    await queryInterface.removeColumn('tower_defense_games', 'bet_item_id');
  }
};

