'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('case_item_drops', {
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
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      case_template_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'case_templates',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      item_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'items',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      dropped_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      case_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'cases',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      }
    });

    // Создаем индексы для быстрого поиска
    await queryInterface.addIndex('case_item_drops', ['user_id']);
    await queryInterface.addIndex('case_item_drops', ['case_template_id']);
    await queryInterface.addIndex('case_item_drops', ['item_id']);
    await queryInterface.addIndex('case_item_drops', ['user_id', 'case_template_id']);
    await queryInterface.addIndex('case_item_drops', ['user_id', 'case_template_id', 'item_id'], {
      unique: true,
      name: 'unique_user_case_item_drop'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('case_item_drops');
  }
};
