'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('live_drops', {
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
        comment: "ID пользователя, получившего предмет"
      },
      item_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'items',
          key: 'id'
        },
        comment: "ID выпавшего предмета"
      },
      case_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'cases',
          key: 'id'
        },
        comment: "ID кейса, из которого выпал предмет"
      },
      drop_time: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
        comment: "Время выпадения предмета"
      },
      is_rare_item: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: "Является ли предмет редким (для выделения в интерфейсе)"
      },
      item_price: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        comment: "Цена предмета на момент выпадения (для быстрого доступа без JOIN)"
      },
      item_rarity: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: "Редкость предмета на момент выпадения (для быстрого доступа без JOIN)"
      },
      user_level: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: "Уровень пользователя на момент выпадения"
      },
      user_subscription_tier: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: "Уровень подписки пользователя на момент выпадения"
      },
      is_highlighted: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: "Выделять ли это выпадение в интерфейсе (например, очень дорогие предметы)"
      },
      is_hidden: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: "Скрывать ли это выпадение из ленты (для модерации)"
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
    await queryInterface.addIndex('live_drops', ['drop_time']);
    await queryInterface.addIndex('live_drops', ['user_id']);
    await queryInterface.addIndex('live_drops', ['item_id']);
    await queryInterface.addIndex('live_drops', ['is_rare_item']);
    await queryInterface.addIndex('live_drops', ['is_hidden']);
    await queryInterface.addIndex('live_drops', ['item_price']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('live_drops');
  }
};
