'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('bonus_minigame_histories', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      played_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
        comment: 'Дата и время прохождения мини-игры'
      },
      game_grid: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: 'Структура сетки/квадратов/выигрышных клеток (JSON)'
      },
      chosen_cells: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: 'Какие клетки выбрал пользователь (JSON)'
      },
      won: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        comment: 'Выиграл или нет (есть приз)'
      },
      prize_type: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: 'Тип приза: item, balance, xp, sub_days, none'
      },
      prize_value: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: 'Значение приза (id/сумма/xp/дней), если не выиграл — null'
      }
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('bonus_minigame_histories');
  }
};
