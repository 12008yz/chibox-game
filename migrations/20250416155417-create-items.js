'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // Создание ENUM типа для редкости предметов
    await queryInterface.sequelize.query('CREATE TYPE "enum_items_rarity" AS ENUM(\'common\', \'uncommon\', \'rare\', \'epic\', \'legendary\', \'mythical\');');

    await queryInterface.createTable('items', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: "Название предмета в CS2"
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: "Описание предмета"
      },
      image_url: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: "URL изображения предмета"
      },
      price: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.00,
        comment: "Рыночная стоимость предмета"
      },
      value: {
        type: Sequelize.INTEGER, // или DECIMAL если ожидается дробное значение
        allowNull: false,
        defaultValue: 0
      },
      rarity: {
        type: Sequelize.ENUM('common', 'uncommon', 'rare', 'epic', 'legendary', 'mythical'),
        allowNull: false,
        defaultValue: 'common',
        comment: "Редкость предмета"
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      drop_weight: {
        type: Sequelize.FLOAT,
        allowNull: false,
        defaultValue: 1.0,
        comment: "Базовый вес выпадения предмета (выше число = чаще выпадает)"
      },
      weapon_type: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: "Тип оружия (например, Rifle, Pistol, Knife)"
      },
      skin_name: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: "Название скина"
      },
      category_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'item_categories',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        comment: "ID категории предмета"
      },
      steam_market_hash_name: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: "Хеш-имя предмета на торговой площадке Steam (для вывода)"
      },
      is_available: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        comment: "Доступен ли предмет для выпадения из кейсов"
      },
      min_subscription_tier: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "Минимальный уровень подписки для выпадения (0 = любой)"
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
    await queryInterface.addIndex('items', ['rarity']);
    await queryInterface.addIndex('items', ['price']);
    await queryInterface.addIndex('items', ['is_available']);
    await queryInterface.addIndex('items', ['category_id']);
    await queryInterface.addIndex('items', ['weapon_type']);
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.dropTable('items');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_items_rarity";');
  }
};
