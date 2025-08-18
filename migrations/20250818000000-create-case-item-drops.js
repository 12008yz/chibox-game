'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Проверяем, существует ли таблица
    const tableExists = await queryInterface.showAllTables().then(tables =>
      tables.includes('case_item_drops')
    );

    if (!tableExists) {
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

      // Создаем индексы для быстрого поиска только если они не существуют
      const indexes = await queryInterface.showIndex('case_item_drops');
      const existingIndexNames = indexes.map(idx => idx.name);

      if (!existingIndexNames.includes('case_item_drops_user_id')) {
        try {
          await queryInterface.addIndex('case_item_drops', ['user_id']);
        } catch (error) {
          console.log('Индекс case_item_drops_user_id уже существует или ошибка:', error.message);
        }
      }

      if (!existingIndexNames.includes('case_item_drops_case_template_id')) {
        try {
          await queryInterface.addIndex('case_item_drops', ['case_template_id']);
        } catch (error) {
          console.log('Индекс case_item_drops_case_template_id уже существует или ошибка:', error.message);
        }
      }

      if (!existingIndexNames.includes('case_item_drops_item_id')) {
        try {
          await queryInterface.addIndex('case_item_drops', ['item_id']);
        } catch (error) {
          console.log('Индекс case_item_drops_item_id уже существует или ошибка:', error.message);
        }
      }

      if (!existingIndexNames.some(name => name.includes('user_id_case_template_id') && !name.includes('item_id'))) {
        try {
          await queryInterface.addIndex('case_item_drops', ['user_id', 'case_template_id']);
        } catch (error) {
          console.log('Индекс user_id_case_template_id уже существует или ошибка:', error.message);
        }
      }

      if (!existingIndexNames.includes('unique_user_case_item_drop')) {
        try {
          await queryInterface.addIndex('case_item_drops', ['user_id', 'case_template_id', 'item_id'], {
            unique: true,
            name: 'unique_user_case_item_drop'
          });
        } catch (error) {
          console.log('Индекс unique_user_case_item_drop уже существует или ошибка:', error.message);
        }
      }
    }
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('case_item_drops');
  }
};
