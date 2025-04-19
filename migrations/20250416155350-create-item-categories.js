'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('item_categories', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
        comment: "Название категории предметов"
      },
      sort_order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      description: {
        type: Sequelize.TEXT,
        comment: "Описание категории"
      },
      icon_url: {
        type: Sequelize.STRING,
        comment: "URL иконки категории"
      },
      display_order: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "Порядок отображения в списке категорий"
      },
      color_code: {
        type: Sequelize.STRING,
        comment: "Цветовой код для отображения категории (HEX)"
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        comment: "Активна ли категория"
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
    await queryInterface.addIndex('item_categories', ['name'], { unique: true });
    await queryInterface.addIndex('item_categories', ['is_active']);
    await queryInterface.addIndex('item_categories', ['display_order']);
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.dropTable('item_categories');
  }
};
