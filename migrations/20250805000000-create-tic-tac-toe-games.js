'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('tic_tac_toe_games', {
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
      game_state: {
        type: Sequelize.JSON,
        allowNull: false,
        defaultValue: {
          board: [null, null, null, null, null, null, null, null, null],
          currentPlayer: 'player',
          winner: null,
          status: 'playing'
        }
      },
      attempts_left: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 3
      },
      bot_goes_first: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      result: {
        type: Sequelize.ENUM('win', 'lose', 'draw', 'ongoing'),
        allowNull: false,
        defaultValue: 'ongoing'
      },
      reward_given: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('tic_tac_toe_games');
  }
};
