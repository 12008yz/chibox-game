'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('user_missions', {
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
        comment: "ID пользователя"
      },
      mission_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'missions',
          key: 'id'
        },
        comment: "ID миссии"
      },
      progress: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "Текущий прогресс выполнения миссии"
      },
      is_completed: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: "Выполнена ли миссия"
      },
      completion_date: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Дата выполнения миссии"
      },
      rewards_claimed: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: "Получена ли награда за выполнение миссии"
      },
      reward_claim_date: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Дата получения награды"
      },
      unlock_date: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
        comment: "Дата разблокировки миссии для пользователя"
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Срок действия миссии для пользователя (для временных миссий)"
      },
      last_reset_date: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Дата последнего сброса прогресса (для повторяющихся миссий)"
      },
      times_completed: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "Сколько раз миссия была выполнена (для повторяющихся миссий)"
      },
      data: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: "Дополнительные данные о выполнении миссии в формате JSON"
      },
      last_updated: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
        comment: "Дата последнего обновления прогресса"
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
    await queryInterface.addIndex('user_missions', ['user_id']);
    await queryInterface.addIndex('user_missions', ['mission_id']);
    await queryInterface.addIndex('user_missions', ['is_completed']);
    await queryInterface.addIndex('user_missions', ['rewards_claimed']);
    await queryInterface.addIndex('user_missions', ['expires_at']);
    await queryInterface.addIndex('user_missions', ['user_id', 'mission_id'], { unique: true });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('user_missions');
  }
};
