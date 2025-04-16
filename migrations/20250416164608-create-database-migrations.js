'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('database_migrations', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
        comment: "Имя миграции (обычно имя файла миграции)"
      },
      applied_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
        comment: "Дата и время применения миграции"
      },
      version: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: "Версия, к которой относится миграция"
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: "Описание изменений в миграции"
      },
      is_system: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: "Является ли системной миграцией"
      },
      applied_by: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: "ID пользователя, применившего миграцию"
      },
      rollback_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Дата и время отката миграции (null, если не откатывалась)"
      },
      rollback_by: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: "ID пользователя, откатившего миграцию"
      },
      rollback_reason: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: "Причина отката миграции"
      },
      checksum: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: "Контрольная сумма файла миграции для обнаружения изменений"
      },
      execution_time: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: "Время выполнения миграции в миллисекундах"
      },
      is_successful: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        comment: "Успешно ли выполнилась миграция"
      },
      error_message: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: "Сообщение об ошибке, если миграция не удалась"
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
    await queryInterface.addIndex('database_migrations', ['name'], { unique: true });
    await queryInterface.addIndex('database_migrations', ['version']);
    await queryInterface.addIndex('database_migrations', ['applied_at']);
    await queryInterface.addIndex('database_migrations', ['is_system']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('database_migrations');
  }
};
