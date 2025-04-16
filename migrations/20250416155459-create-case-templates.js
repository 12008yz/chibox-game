'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // Создаем ENUM тип для типов кейсов
    await queryInterface.sequelize.query('CREATE TYPE "enum_case_templates_type" AS ENUM(\'daily\', \'premium\', \'event\', \'special\', \'achievement\');');

    await queryInterface.createTable('case_templates', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: "Название шаблона кейса"
      },
      description: {
        type: Sequelize.TEXT,
        comment: "Описание кейса"
      },
      image_url: {
        type: Sequelize.STRING,
        comment: "URL изображения кейса"
      },
      animation_url: {
        type: Sequelize.STRING,
        comment: "URL анимации открытия кейса"
      },
      type: {
        type: Sequelize.ENUM('daily', 'premium', 'event', 'special', 'achievement'),
        allowNull: false,
        defaultValue: 'daily',
        comment: "Тип кейса (ежедневный, премиум, событийный, специальный, награда за достижение)"
      },
      min_subscription_tier: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "Минимальный уровень подписки для доступа к кейсу (0 - без подписки)"
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        comment: "Активен ли кейс в системе"
      },
      availability_start: {
        type: Sequelize.DATE,
        comment: "Дата начала доступности кейса (для временных кейсов)"
      },
      availability_end: {
        type: Sequelize.DATE,
        comment: "Дата окончания доступности кейса (для временных кейсов)"
      },
      max_opens_per_user: {
        type: Sequelize.INTEGER,
        comment: "Максимальное количество открытий на пользователя (null - без ограничений)"
      },
      cooldown_hours: {
        type: Sequelize.INTEGER,
        defaultValue: 24,
        comment: "Период ожидания между выдачами кейса в часах"
      },
      price: {
        type: Sequelize.DECIMAL(10, 2),
        comment: "Цена кейса в рублях (null - бесплатный)"
      },
      item_pool_config: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
        comment: "Конфигурация пула предметов и шансов выпадения в формате JSON"
      },
      special_conditions: {
        type: Sequelize.JSONB,
        comment: "Особые условия для получения кейса (например, минимальный уровень) в формате JSON"
      },
      sort_order: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "Порядок сортировки в интерфейсе (чем меньше значение, тем выше в списке)"
      },
      color_scheme: {
        type: Sequelize.STRING,
        comment: "Цветовая схема для отображения кейса в интерфейсе"
      },
      guaranteed_min_value: {
        type: Sequelize.DECIMAL(10, 2),
        comment: "Гарантированная минимальная стоимость выпадающего предмета"
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

    // Создаем индексы
    await queryInterface.addIndex('case_templates', ['type']);
    await queryInterface.addIndex('case_templates', ['is_active']);
    await queryInterface.addIndex('case_templates', ['min_subscription_tier']);
    await queryInterface.addIndex('case_templates', ['availability_start', 'availability_end']);
    await queryInterface.addIndex('case_templates', ['sort_order']);
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.dropTable('case_templates');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_case_templates_type";');
  }
};
