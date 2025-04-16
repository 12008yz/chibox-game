'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('user_achievements', {
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
        }
      },
      achievement_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'achievements',
          key: 'id'
        }
      },
      current_progress: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "Текущий прогресс по достижению"
      },
      is_completed: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: "Выполнено ли достижение"
      },
      completion_date: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Дата получения достижения"
      },
      notified: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: "Было ли уведомление о получении достижения"
      },
      bonus_applied: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: "Был ли применен бонус от этого достижения к профилю пользователя"
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
    await queryInterface.addIndex('user_achievements', ['user_id', 'achievement_id'], { unique: true });
    await queryInterface.addIndex('user_achievements', ['user_id', 'is_completed']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('user_achievements');
  }
};
