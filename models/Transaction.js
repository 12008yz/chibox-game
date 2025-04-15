'use strict';

module.exports = (sequelize, DataTypes) => {
  const Transaction = sequelize.define('Transaction', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      },
      comment: "ID пользователя, совершившего транзакцию"
    },
    type: {
      type: DataTypes.ENUM(
        'balance_add',           // Пополнение баланса
        'balance_subtract',      // Списание с баланса
        'subscription_purchase', // Покупка подписки
        'item_sale',             // Продажа предмета
        'subscription_convert',  // Конвертация предмета в подписку
        'withdrawal_fee',        // Комиссия за вывод
        'system',                // Системная транзакция
        'referral_bonus',        // Реферальный бонус
        'achievement_reward'     // Награда за достижение
      ),
      allowNull: false,
      comment: "Тип транзакции"
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      comment: "Сумма транзакции (положительная или отрицательная)"
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Описание транзакции"
    },
    status: {
      type: DataTypes.ENUM('pending', 'completed', 'failed', 'cancelled'),
      defaultValue: 'completed',
      comment: "Статус транзакции"
    },
    related_entity_id: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "ID связанной сущности (предмет, платеж и т.д.)"
    },
    related_entity_type: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Тип связанной сущности (Item, Payment, Subscription)"
    },
    balance_before: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      comment: "Баланс пользователя до транзакции"
    },
    balance_after: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      comment: "Баланс пользователя после транзакции"
    },
    ip_address: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "IP-адрес, с которого была выполнена транзакция"
    },
    user_agent: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "User-Agent браузера, с которого была выполнена транзакция"
    },
    is_system: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Является ли транзакция системной (автоматической)"
    },
    admin_id: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "ID администратора, если транзакция была выполнена им"
    },
    payment_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'payments',
        key: 'id'
      },
      comment: "ID платежа, если транзакция связана с пополнением баланса"
    }
  }, {
    timestamps: true,
    underscored: true,
    tableName: 'transactions',
    indexes: [
      {
        fields: ['user_id']
      },
      {
        fields: ['type']
      },
      {
        fields: ['status']
      },
      {
        fields: ['created_at']
      },
      {
        fields: ['related_entity_id', 'related_entity_type']
      },
      {
        fields: ['payment_id']
      }
    ]
  });

  // Ассоциации
  Transaction.associate = (models) => {
    Transaction.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    });

    Transaction.belongsTo(models.Payment, {
      foreignKey: 'payment_id',
      as: 'payment'
    });

    Transaction.hasMany(models.UserInventory, {
      foreignKey: 'transaction_id',
      as: 'inventory_items'
    });

    // Дополнительные ассоциации, если нужны
  };

  return Transaction;
};
