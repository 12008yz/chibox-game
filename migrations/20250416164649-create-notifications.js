'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('notifications', {
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
        comment: "ID пользователя, которому отправлено уведомление"
      },
      title: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: "Заголовок уведомления"
      },
      message: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: "Текст уведомления"
      },
      type: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'info',
        comment: "Тип уведомления (info, success, warning, error, system)"
      },
      category: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: "Категория уведомления"
      },
      link: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: "URL-ссылка для действия (если есть)"
      },
      is_read: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: "Прочитано ли уведомление пользователем"
      },
      read_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Когда было прочитано уведомление"
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Дата истечения уведомления (null - бессрочно)"
      },
      importance: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "Важность уведомления (0-10), влияет на сортировку"
      },
      data: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: "Дополнительные данные в формате JSON"
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
    await queryInterface.addIndex('notifications', ['user_id']);
    await queryInterface.addIndex('notifications', ['type']);
    await queryInterface.addIndex('notifications', ['category']);
    await queryInterface.addIndex('notifications', ['is_read']);
    await queryInterface.addIndex('notifications', ['expires_at']);
    await queryInterface.addIndex('notifications', ['importance']);
    await queryInterface.addIndex('notifications', ['created_at']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('notifications');
  }
};
