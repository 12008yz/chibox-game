'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('unlockable_contents', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: "Название разблокируемого контента"
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: "Описание разблокируемого контента"
      },
      type: {
        type: Sequelize.ENUM('case', 'item', 'achievement', 'feature', 'bonus', 'skin', 'special_event', 'other'),
        allowNull: false,
        comment: "Тип разблокируемого контента"
      },
      image_url: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: "URL изображения контента"
      },
      teaser_image_url: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: "URL изображения-тизера (показывается до разблокировки)"
      },
      status: {
        type: Sequelize.ENUM('active', 'inactive', 'coming_soon', 'expired'),
        defaultValue: 'active',
        comment: "Статус разблокируемого контента"
      },
      unlock_conditions: {
        type: Sequelize.JSONB,
        allowNull: false,
        comment: "Условия разблокировки в формате JSON (например, достижения, уровень, события)"
      },
      unlock_progress_config: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: "Конфигурация отслеживания прогресса разблокировки"
      },
      reward_config: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: "Конфигурация награды за разблокировку"
      },
      related_item_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: "ID связанного предмета, если контент является предметом"
      },
      related_case_template_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: "ID связанного шаблона кейса, если контент является кейсом"
      },
      min_level: {
        type: Sequelize.INTEGER,
        defaultValue: 1,
        comment: "Минимальный уровень пользователя для разблокировки"
      },
      min_subscription_tier: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "Минимальный уровень подписки для разблокировки (0 - без подписки)"
      },
      start_date: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Дата начала доступности контента"
      },
      end_date: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Дата окончания доступности контента"
      },
      difficulty: {
        type: Sequelize.ENUM('easy', 'medium', 'hard', 'extreme'),
        defaultValue: 'medium',
        comment: "Сложность разблокировки контента"
      },
      display_order: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "Порядок отображения в интерфейсе"
      },
      is_hidden: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: "Скрыт ли контент до выполнения определенных условий"
      },
      hidden_conditions: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: "Условия для отображения скрытого контента"
      },
      is_premium: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: "Является ли контент премиум-контентом"
      },
      custom_code: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: "Пользовательский код для контента (для интеграции с кодом)"
      },
      feature_flags: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        defaultValue: [],
        comment: "Флаги для дополнительных функций"
      },
      meta_data: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: "Метаданные для контента"
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
    await queryInterface.addIndex('unlockable_contents', ['type']);
    await queryInterface.addIndex('unlockable_contents', ['status']);
    await queryInterface.addIndex('unlockable_contents', ['min_level']);
    await queryInterface.addIndex('unlockable_contents', ['min_subscription_tier']);
    await queryInterface.addIndex('unlockable_contents', ['start_date', 'end_date']);
    await queryInterface.addIndex('unlockable_contents', ['is_premium']);
    await queryInterface.addIndex('unlockable_contents', ['display_order']);
    await queryInterface.addIndex('unlockable_contents', ['custom_code'], {
      unique: true,
      where: {
        custom_code: {
          [Sequelize.Op.ne]: null
        }
      }
    });

    // Добавление внешних ключей
    await queryInterface.addConstraint('unlockable_contents', {
      fields: ['related_item_id'],
      type: 'foreign key',
      name: 'unlockable_contents_related_item_fkey',
      references: {
        table: 'items',
        field: 'id'
      },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE'
    });

    await queryInterface.addConstraint('unlockable_contents', {
      fields: ['related_case_template_id'],
      type: 'foreign key',
      name: 'unlockable_contents_related_case_template_fkey',
      references: {
        table: 'case_templates',
        field: 'id'
      },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeConstraint('unlockable_contents', 'unlockable_contents_related_item_fkey');
    await queryInterface.removeConstraint('unlockable_contents', 'unlockable_contents_related_case_template_fkey');
    await queryInterface.dropTable('unlockable_contents');
  }
};
