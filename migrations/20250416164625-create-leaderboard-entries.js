'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('leaderboard_entries', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      leaderboard_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'leaderboards',
          key: 'id'
        },
        comment: "ID таблицы лидеров, к которой относится запись"
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        comment: "ID пользователя"
      },
      rank: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: "Ранг пользователя в таблице лидеров"
      },
      score: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
        comment: "Очки пользователя (может быть количеством или стоимостью в зависимости от типа таблицы)"
      },
      prev_rank: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: "Предыдущий ранг пользователя для отслеживания изменений"
      },
      value_change: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: true,
        comment: "Изменение значения по сравнению с предыдущим периодом"
      },
      details: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: "Детали достижения (например, статистика по типам предметов)"
      },
      rewards_claimed: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: "Получил ли пользователь награду за место в таблице лидеров"
      },
      reward_claim_date: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Дата получения награды"
      },
      snapshot_data: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: "Снапшот данных пользователя на момент записи (уровень, имя и т.д.)"
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
    await queryInterface.addIndex('leaderboard_entries', ['leaderboard_id']);
    await queryInterface.addIndex('leaderboard_entries', ['user_id']);
    await queryInterface.addIndex('leaderboard_entries', ['rank']);
    await queryInterface.addIndex('leaderboard_entries', ['leaderboard_id', 'user_id'], { unique: true });
    await queryInterface.addIndex('leaderboard_entries', ['leaderboard_id', 'rank'], { unique: true });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('leaderboard_entries');
  }
};
