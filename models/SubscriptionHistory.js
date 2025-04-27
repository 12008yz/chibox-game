'use strict';
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const SubscriptionHistory = sequelize.define('SubscriptionHistory', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' }
    },
    action: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Тип действия: purchase, prolongation, exchange_item, promo и т.д.'
    },
    days: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'Кол-во дней, прибавленных к подписке'
    },
    price: {
      type: DataTypes.DECIMAL(10,2),
      allowNull: false,
      defaultValue: 0.00,
      comment: 'Сумма оплаты (0, если обмен или промо)'
    },
    item_id: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'ID предмета, если продление через обмен'
    },
    transaction_id: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'ID транзакции, если есть связь'
    },
    method: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Метод оплаты: card, internal_balance, item, promo и т.д.'
    },
    date: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  }, {
    timestamps: false,
    underscored: true,
    tableName: 'subscription_histories'
  });

  SubscriptionHistory.associate = (models) => {
    SubscriptionHistory.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
  };

  return SubscriptionHistory;
};
