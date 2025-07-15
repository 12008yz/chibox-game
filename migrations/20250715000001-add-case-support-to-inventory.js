'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableDescription = await queryInterface.describeTable('user_inventory');
    if (!tableDescription['item_type']) {
      try {
        await queryInterface.addColumn('user_inventory', 'item_type', {
          type: Sequelize.ENUM('item', 'case'),
          allowNull: false,
          defaultValue: 'item',
          comment: 'Тип предмета: обычный предмет или кейс'
        });
      } catch (error) {
        if (!error.message.includes('already exists')) {
          throw error;
        }
      }
    }

    if (!tableDescription['case_template_id']) {
      try {
        await queryInterface.addColumn('user_inventory', 'case_template_id', {
          type: Sequelize.UUID,
          allowNull: true,
          references: {
            model: 'case_templates',
            key: 'id'
          },
          comment: 'ID шаблона кейса, если это кейс в инвентаре'
        });
      } catch (error) {
        if (!error.message.includes('already exists')) {
          throw error;
        }
      }
    }

    if (!tableDescription['expires_at']) {
      try {
        await queryInterface.addColumn('user_inventory', 'expires_at', {
          type: Sequelize.DATE,
          allowNull: true,
          comment: 'Дата истечения срока действия кейса/предмета'
        });
      } catch (error) {
        if (!error.message.includes('already exists')) {
          throw error;
        }
      }
    }

    // Добавим индексы для новых полей
    await queryInterface.addIndex('user_inventory', ['item_type']);
    await queryInterface.addIndex('user_inventory', ['case_template_id']);
    await queryInterface.addIndex('user_inventory', ['user_id', 'item_type']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeIndex('user_inventory', ['user_id', 'item_type']);
    await queryInterface.removeIndex('user_inventory', ['case_template_id']);
    await queryInterface.removeIndex('user_inventory', ['item_type']);

    await queryInterface.removeColumn('user_inventory', 'expires_at');
    await queryInterface.removeColumn('user_inventory', 'case_template_id');
    await queryInterface.removeColumn('user_inventory', 'item_type');
  }
};
