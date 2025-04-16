'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // Создание ENUM типов
    try {
      await queryInterface.sequelize.query(`
        CREATE TYPE "enum_transactions_type" AS ENUM(
          'balance_add',
          'balance_subtract',
          'subscription_purchase',
          'item_sale',
          'subscription_convert',
          'withdrawal_fee',
          'system',
          'referral_bonus',
          'achievement_reward'
        );
      `).catch(err => {
        if (err.message.includes('already exists')) {
          console.log('ENUM тип "enum_transactions_type" уже существует');
        } else {
          throw err;
        }
      });

      await queryInterface.sequelize.query(`
        CREATE TYPE "enum_transactions_status" AS ENUM(
          'pending',
          'completed',
          'failed',
          'cancelled'
        );
      `).catch(err => {
        if (err.message.includes('already exists')) {
          console.log('ENUM тип "enum_transactions_status" уже существует');
        } else {
          throw err;
        }
      });
    } catch (error) {
      console.error('Ошибка при создании ENUM типов:', error.message);
    }

    await queryInterface.createTable('transactions', {
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
        comment: "ID пользователя, совершившего транзакцию"
      },
      type: {
        type: Sequelize.ENUM(
          'balance_add',
          'balance_subtract',
          'subscription_purchase',
          'item_sale',
          'subscription_convert',
          'withdrawal_fee',
          'system',
          'referral_bonus',
          'achievement_reward'
        ),
        allowNull: false,
        comment: "Тип транзакции"
      },
      amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        comment: "Сумма транзакции (положительная или отрицательная)"
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: "Описание транзакции"
      },
      status: {
        type: Sequelize.ENUM('pending', 'completed', 'failed', 'cancelled'),
        defaultValue: 'completed',
        comment: "Статус транзакции"
      },
      related_entity_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: "ID связанной сущности (предмет, платеж и т.д.)"
      },
      related_entity_type: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: "Тип связанной сущности (Item, Payment, Subscription)"
      },
      balance_before: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        comment: "Баланс пользователя до транзакции"
      },
      balance_after: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        comment: "Баланс пользователя после транзакции"
      },
      ip_address: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: "IP-адрес, с которого была выполнена транзакция"
      },
      user_agent: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: "User-Agent браузера, с которого была выполнена транзакция"
      },
      is_system: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: "Является ли транзакция системной (автоматической)"
      },
      admin_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: "ID администратора, если транзакция была выполнена им"
      },
      payment_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'payments',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        comment: "ID платежа, если транзакция связана с пополнением баланса"
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
      await queryInterface.addIndex('transactions', ['user_id']);
      await queryInterface.addIndex('transactions', ['type']);
      await queryInterface.addIndex('transactions', ['status']);
      await queryInterface.addIndex('transactions', ['created_at']);
      await queryInterface.addIndex('transactions', ['related_entity_id', 'related_entity_type']);
      await queryInterface.addIndex('transactions', ['payment_id']);
    } catch (error) {
      console.error('Ошибка при создании индексов:', error.message);
    }
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.dropTable('transactions');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_transactions_type";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_transactions_status";');
  }
};
