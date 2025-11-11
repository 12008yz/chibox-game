'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDescription = await queryInterface.describeTable('users');

    // Добавляем поле для попыток в крестики-нолики
    if (!tableDescription.tictactoe_attempts_left) {
      await queryInterface.addColumn('users', 'tictactoe_attempts_left', {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false,
        comment: 'Количество оставшихся попыток в крестики-нолики на сегодня'
      });
    }

    // Добавляем поле для последнего сброса попыток крестиков-ноликов
    if (!tableDescription.last_tictactoe_reset) {
      await queryInterface.addColumn('users', 'last_tictactoe_reset', {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Дата последнего сброса попыток крестиков-ноликов (в 16:00 МСК)'
      });
    }

    // Добавляем поле для попыток рулетки
    if (!tableDescription.roulette_attempts_left) {
      await queryInterface.addColumn('users', 'roulette_attempts_left', {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false,
        comment: 'Количество оставшихся попыток в рулетку на сегодня'
      });
    }

    // Добавляем поле для последнего сброса рулетки
    if (!tableDescription.last_roulette_reset) {
      await queryInterface.addColumn('users', 'last_roulette_reset', {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Дата последнего сброса попыток рулетки (в 16:00 МСК)'
      });
    }

    // Добавляем поле для попыток Safe Cracker
    if (!tableDescription.game_attempts) {
      await queryInterface.addColumn('users', 'game_attempts', {
        type: Sequelize.INTEGER,
        defaultValue: 3,
        allowNull: false,
        comment: 'Количество попыток для игры Safe Cracker'
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const tableDescription = await queryInterface.describeTable('users');

    if (tableDescription.tictactoe_attempts_left) {
      await queryInterface.removeColumn('users', 'tictactoe_attempts_left');
    }

    if (tableDescription.last_tictactoe_reset) {
      await queryInterface.removeColumn('users', 'last_tictactoe_reset');
    }

    if (tableDescription.roulette_attempts_left) {
      await queryInterface.removeColumn('users', 'roulette_attempts_left');
    }

    if (tableDescription.last_roulette_reset) {
      await queryInterface.removeColumn('users', 'last_roulette_reset');
    }

    if (tableDescription.game_attempts) {
      await queryInterface.removeColumn('users', 'game_attempts');
    }
  }
};
