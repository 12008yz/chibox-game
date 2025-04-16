'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('drop_rules', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      subscription_tier: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true,
        comment: "Уровень подписки (0 - без подписки, 1 - Статус, 2 - Статус+, 3 - Статус++)"
      },
      premium_item_bonus: {
        type: Sequelize.FLOAT,
        allowNull: false,
        defaultValue: 0.0,
        comment: "Бонус к вероятности выпадения премиум предметов (например, 0.03 = +3%)"
      },
      premium_price_threshold: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 100.00,
        comment: "Пороговая цена для премиум предметов (например, 100 руб)"
      },
      prevent_duplicates: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: "Предотвращать выпадение дубликатов"
      },
      subscription_price: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.00,
        comment: "Цена подписки в рублях (0 для базового уровня без подписки)"
      },
      cases_per_day: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "Количество кейсов в день (0 для уровня без подписки)"
      },
      case_cooldown_hours: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 24,
        comment: "Период ожидания между выдачей кейсов в часах"
      },
      display_name: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: "Отображаемое название статуса подписки"
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: "Описание преимуществ подписки"
      },
      color_code: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: "Цветовой код для отображения подписки (HEX)"
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        comment: "Активен ли данный уровень подписки"
      },
      can_open_cases: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: "Может ли пользователь с этим уровнем подписки открывать кейсы (false для tier 0)"
      },
      rarity_multipliers: {
        type: Sequelize.JSON,
        allowNull: true,
        comment: "Множители шансов выпадения по редкостям (например, {common: 1.0, rare: 1.2, legendary: 1.5})"
      },
      access_to_bonus: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        comment: "Имеет ли пользователь с этим уровнем доступ к бонусам (каждые 48 часов)"
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
    await queryInterface.addIndex('drop_rules', ['subscription_tier'], { unique: true });
    await queryInterface.addIndex('drop_rules', ['is_active']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('drop_rules');
  }
};
