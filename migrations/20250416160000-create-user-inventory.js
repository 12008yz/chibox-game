'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // Создание ENUM типов
    try {
      await queryInterface.sequelize.query(`
        CREATE TYPE "enum_user_inventory_source" AS ENUM(
          'case',
          'bonus',
          'achievement',
          'purchase',
          'system'
        );
      `).catch(err => {
        if (err.message.includes('already exists')) {
          console.log('ENUM тип "enum_user_inventory_source" уже существует');
        } else {
          throw err;
        }
      });

      await queryInterface.sequelize.query(`
        CREATE TYPE "enum_user_inventory_status" AS ENUM(
          'inventory',
          'sold',
          'converted_to_subscription',
          'withdrawn'
        );
      `).catch(err => {
        if (err.message.includes('already exists')) {
          console.log('ENUM тип "enum_user_inventory_status" уже существует');
        } else {
          throw err;
        }
      });
    } catch (error) {
      console.error('Ошибка при создании ENUM типов:', error.message);
    }

    await queryInterface.createTable('user_inventory', {
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
        onDelete: 'CASCADE',
        comment: "ID пользователя, владеющего предметом"
      },
      item_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'items',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
        comment: "ID предмета в инвентаре"
      },
      acquisition_date: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
        comment: "Дата получения предмета"
      },
      source: {
        type: Sequelize.ENUM('case', 'bonus', 'achievement', 'purchase', 'system'),
        allowNull: false,
        defaultValue: 'case',
        comment: "Источник получения предмета"
      },
      status: {
        type: Sequelize.ENUM('inventory', 'sold', 'converted_to_subscription', 'withdrawn'),
        defaultValue: 'inventory',
        comment: "Статус предмета: в инвентаре, продан, конвертирован в подписку, выведен в Steam"
      },
      transaction_date: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Дата продажи/конвертации/вывода предмета"
      },
      case_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'cases',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        comment: "ID кейса, из которого был получен предмет (если source = 'case')"
      },
      transaction_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'transactions',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        comment: "ID транзакции, связанной с этим предметом (при продаже или конвертации)"
      },
      withdrawal_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'withdrawals',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        comment: "ID запроса на вывод этого предмета (если был запрос)"
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
    try {
      await queryInterface.addIndex('user_inventory', ['user_id']);
      await queryInterface.addIndex('user_inventory', ['item_id']);
      await queryInterface.addIndex('user_inventory', ['status']);
      await queryInterface.addIndex('user_inventory', ['user_id', 'status']);
      await queryInterface.addIndex('user_inventory', ['case_id']);
      await queryInterface.addIndex('user_inventory', ['transaction_id']);
      await queryInterface.addIndex('user_inventory', ['withdrawal_id']);
    } catch (error) {
      console.error('Ошибка при создании индексов:', error.message);
    }
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.dropTable('user_inventory');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_user_inventory_source";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_user_inventory_status";');
  }
};
