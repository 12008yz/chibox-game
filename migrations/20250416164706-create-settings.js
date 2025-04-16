'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('settings', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      key: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
        comment: "Ключ настройки"
      },
      value: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: "Значение настройки"
      },
      type: {
        type: Sequelize.ENUM('string', 'number', 'boolean', 'json', 'array'),
        defaultValue: 'string',
        comment: "Тип значения настройки"
      },
      category: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'general',
        comment: "Категория настройки (general, drop_rates, payments, etc.)"
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: "Описание настройки"
      },
      is_public: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: "Доступна ли настройка клиентам"
      },
      requires_restart: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: "Требует ли изменение настройки перезапуска сервера"
      },
      default_value: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: "Значение по умолчанию"
      },
      validation_rules: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: "Правила валидации в формате JSON"
      },
      modified_by: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: "ID пользователя, последним изменившим настройку"
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
    await queryInterface.addIndex('settings', ['key'], { unique: true });
    await queryInterface.addIndex('settings', ['category']);
    await queryInterface.addIndex('settings', ['is_public']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('settings');
  }
};
