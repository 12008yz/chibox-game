'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('caches', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      key: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true,
        comment: "Ключ кэша"
      },
      value: {
        type: Sequelize.TEXT('long'),
        allowNull: true,
        comment: "Значение кэша в строковом формате (обычно JSON)"
      },
      type: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'general',
        comment: "Тип кэшированных данных"
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Срок действия кэша (null - бессрочно)"
      },
      is_compressed: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: "Сжаты ли данные"
      },
      tags: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        defaultValue: [],
        comment: "Теги для группировки и инвалидации кэша"
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: "Метаданные о кэше"
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: "ID пользователя, создавшего кэш (null для системных кэшей)"
      },
      is_system: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: "Является ли кэш системным"
      },
      last_accessed: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Время последнего доступа к кэшу"
      },
      access_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "Количество обращений к кэшу"
      },
      size_bytes: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: "Размер кэшированных данных в байтах"
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
    await queryInterface.addIndex('caches', ['key'], { unique: true });
    await queryInterface.addIndex('caches', ['type']);
    await queryInterface.addIndex('caches', ['expires_at']);
    await queryInterface.addIndex('caches', ['is_system']);
    await queryInterface.addIndex('caches', ['tags'], { using: 'gin' });
    await queryInterface.addIndex('caches', ['last_accessed']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('caches');
  }
};
