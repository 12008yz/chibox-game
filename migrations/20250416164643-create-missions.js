'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('missions', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      title: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: "Название миссии"
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: "Описание миссии"
      },
      icon_url: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: "URL иконки миссии"
      },
      type: {
        type: Sequelize.ENUM('daily', 'weekly', 'achievement', 'special', 'onetime', 'event'),
        allowNull: false,
        defaultValue: 'daily',
        comment: "Тип миссии"
      },
      status: {
        type: Sequelize.ENUM('active', 'disabled', 'expired', 'upcoming'),
        allowNull: false,
        defaultValue: 'active',
        comment: "Статус миссии"
      },
      difficulty: {
        type: Sequelize.ENUM('easy', 'medium', 'hard', 'extreme'),
        allowNull: false,
        defaultValue: 'easy',
        comment: "Сложность миссии"
      },
      action_type: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: "Тип действия (open_cases, get_rare_items, login_streak, etc.)"
      },
      required_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
        comment: "Требуемое количество для выполнения"
      },
      min_subscription_tier: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "Минимальный уровень подписки для доступа к миссии (0 - без подписки)"
      },
      min_level: {
        type: Sequelize.INTEGER,
        defaultValue: 1,
        comment: "Минимальный уровень пользователя для доступа к миссии"
      },
      start_date: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Дата начала миссии (null - всегда доступна)"
      },
      end_date: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Дата окончания миссии (null - бессрочно)"
      },
      condition_config: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
        comment: "Конфигурация условий выполнения миссии в формате JSON"
      },
      reward_config: {
        type: Sequelize.JSONB,
        allowNull: false,
        comment: "Конфигурация наград за выполнение миссии в формате JSON"
      },
      xp_reward: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "Количество XP за выполнение миссии"
      },
      reset_period: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: "Период сброса в часах (null - без сброса, разовая миссия)"
      },
      has_progress: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        comment: "Имеет ли миссия прогресс или это единичное действие"
      },
      is_hidden: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: "Скрыта ли миссия до выполнения определенных условий"
      },
      hidden_condition_config: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: "Условия для показа скрытой миссии в формате JSON"
      },
      order: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "Порядок отображения миссии"
      },
      group_id: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: "ID группы миссий (для связанных миссий)"
      },
      is_sequential: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: "Является ли частью последовательности миссий"
      },
      next_mission_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: "ID следующей миссии в последовательности"
      },
      unlockable_content_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: "ID разблокируемого контента, связанного с этой миссией"
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
    await queryInterface.addIndex('missions', ['type']);
    await queryInterface.addIndex('missions', ['status']);
    await queryInterface.addIndex('missions', ['action_type']);
    await queryInterface.addIndex('missions', ['min_subscription_tier']);
    await queryInterface.addIndex('missions', ['min_level']);
    await queryInterface.addIndex('missions', ['start_date', 'end_date']);
    await queryInterface.addIndex('missions', ['is_hidden']);
    await queryInterface.addIndex('missions', ['group_id']);
    await queryInterface.addIndex('missions', ['order']);

    // После создания всех таблиц добавим внешний ключ на self-reference
    await queryInterface.addConstraint('missions', {
      fields: ['next_mission_id'],
      type: 'foreign key',
      name: 'missions_next_mission_fkey',
      references: {
        table: 'missions',
        field: 'id'
      },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeConstraint('missions', 'missions_next_mission_fkey');
    await queryInterface.dropTable('missions');
  }
};
