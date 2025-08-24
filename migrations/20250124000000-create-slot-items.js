'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('slot_items', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false,
        comment: 'Название предмета'
      },
      image_url: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'URL изображения предмета Steam CDN'
      },
      price: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.00,
        comment: 'Цена предмета в рублях'
      },
      rarity: {
        type: Sequelize.ENUM('consumer', 'industrial', 'milspec', 'restricted', 'classified', 'covert', 'contraband', 'exotic'),
        allowNull: false,
        defaultValue: 'consumer',
        comment: 'Редкость предмета'
      },
      steam_market_hash_name: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'Steam Market Hash Name для API запросов'
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'Активен ли предмет в слот-игре'
      },
      drop_weight: {
        type: Sequelize.DECIMAL(8, 4),
        allowNull: false,
        defaultValue: 1.0000,
        comment: 'Вес выпадения в слот-игре'
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

    // Создаем индексы
    await queryInterface.addIndex('slot_items', ['rarity']);
    await queryInterface.addIndex('slot_items', ['price']);
    await queryInterface.addIndex('slot_items', ['is_active']);
    await queryInterface.addIndex('slot_items', ['steam_market_hash_name'], { unique: true });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('slot_items');
  }
};
