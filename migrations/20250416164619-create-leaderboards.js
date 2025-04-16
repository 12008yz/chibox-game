'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('leaderboards', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      type: {
        type: Sequelize.ENUM('cases_opened', 'items_value', 'rare_items', 'subscription_days', 'level', 'achievements'),
        allowNull: false,
        comment: "Тип таблицы лидеров"
      },
      period: {
        type: Sequelize.ENUM('daily', 'weekly', 'monthly', 'alltime'),
        allowNull: false,
        defaultValue: 'alltime',
        comment: "Период таблицы лидеров"
      },
      period_start: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Дата начала периода (для конкретного периода)"
      },
      period_end: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Дата окончания периода (для конкретного периода)"
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        comment: "Активна ли таблица лидеров"
      },
      title: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: "Название таблицы лидеров"
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: "Описание таблицы лидеров"
      },
      reward_config: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: "Конфигурация наград для призовых мест в формате JSON"
      },
      display_limit: {
        type: Sequelize.INTEGER,
        defaultValue: 100,
        comment: "Количество отображаемых мест в таблице лидеров"
      },
      last_updated: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
        comment: "Дата последнего обновления таблицы лидеров"
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
    await queryInterface.addIndex('leaderboards', ['type']);
    await queryInterface.addIndex('leaderboards', ['period']);
    await queryInterface.addIndex('leaderboards', ['is_active']);
    await queryInterface.addIndex('leaderboards', ['type', 'period'], {
      unique: true,
      where: {
        is_active: true,
        period: 'alltime'
      }
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('leaderboards');
  }
};
