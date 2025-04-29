'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('case_template_items', {
      case_template_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'case_templates',
          key: 'id'
        },
        onDelete: 'CASCADE',
        primaryKey: true
      },
      item_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'items',
          key: 'id'
        },
        onDelete: 'CASCADE',
        primaryKey: true
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('case_template_items');
  }
};
