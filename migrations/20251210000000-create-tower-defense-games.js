'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('tower_defense_games', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      waves_completed: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false
      },
      total_waves: {
        type: Sequelize.INTEGER,
        defaultValue: 10,
        allowNull: false
      },
      enemies_killed: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false
      },
      towers_built: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false
      },
      score: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false
      },
      result: {
        type: Sequelize.ENUM('win', 'lose', 'in_progress'),
        defaultValue: 'in_progress',
        allowNull: false
      },
      reward_amount: {
        type: Sequelize.DECIMAL(10, 2),
        defaultValue: 0,
        allowNull: true
      },
      game_data: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      completed_at: {
        type: Sequelize.DATE,
        allowNull: true
      }
    });

    await queryInterface.addIndex('tower_defense_games', ['user_id']);
    await queryInterface.addIndex('tower_defense_games', ['result']);
    await queryInterface.addIndex('tower_defense_games', ['created_at']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('tower_defense_games');
  }
};
