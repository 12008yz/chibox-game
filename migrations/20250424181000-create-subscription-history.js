'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('subscription_histories', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      action: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: 'Тип действия: purchase, prolongation, exchange_item, promo и т.д.'
      },
      days: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: 'Кол-во дней, прибавленных к подписке'
      },
      price: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.00,
        comment: 'Сумма оплаты (0, если обмен или промо)'
      },
      item_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: 'ID предмета, если продление через обмен'
      },
      transaction_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: 'ID транзакции, если есть связь'
      },
      method: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: 'Метод оплаты: card, internal_balance, item, promo и т.д.'
      },
      date: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      }
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('subscription_histories');
  }
};
