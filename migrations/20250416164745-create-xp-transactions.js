'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('xp_transactions', {
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
        comment: "ID пользователя, получившего XP"
      },
      amount: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: "Количество полученных XP"
      },
      source_type: {
        type: Sequelize.ENUM(
          'case_open',         // Открытие кейса
          'achievement',       // Выполнение достижения
          'daily_login',       // Ежедневный вход
          'battle_win',        // Победа в битве
          'purchase',          // Покупка (пополнение баланса, подписка)
          'referral',          // Реферальная программа
          'admin',             // Начисление администратором
          'event',             // Участие в событии
          'other'              // Другое
        ),
        allowNull: false,
        comment: "Источник получения XP"
      },
      source_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: "ID источника (например, ID достижения, если source_type='achievement')"
      },
      description: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: "Описание операции начисления XP"
      },
      is_level_up: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: "Привело ли это начисление к повышению уровня"
      },
      new_level: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: "Новый уровень пользователя, если произошло повышение"
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });

    // Добавление индексов
    await queryInterface.addIndex('xp_transactions', ['user_id']);
    await queryInterface.addIndex('xp_transactions', ['created_at']);
    await queryInterface.addIndex('xp_transactions', ['source_type']);
    await queryInterface.addIndex('xp_transactions', ['source_id']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('xp_transactions');
  }
};
