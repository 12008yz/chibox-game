const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Payment = sequelize.define('Payment', {
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
      comment: "ID пользователя, совершающего платеж"
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      comment: "Сумма платежа"
    },
    payment_system: {
      type: DataTypes.ENUM('ukassa', 'paypal', 'stripe', 'qiwi', 'webmoney', 'crypto', 'other'),
      allowNull: false,
      comment: "Платежная система, через которую совершается платеж"
    },
    status: {
      type: DataTypes.ENUM('created', 'pending', 'completed', 'failed', 'cancelled', 'refunded'),
      defaultValue: 'created',
      comment: "Статус платежа"
    },
    payment_id: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Внешний ID платежа в платежной системе"
    },
    payment_url: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "URL для оплаты (перенаправление пользователя)"
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Описание платежа"
    },
promo_code_id: {
  type: DataTypes.UUID,
  allowNull: true,
  references: {
    model: 'promo_codes',
    key: 'id'
  },
  comment: "ID промокода, примененного к платежу"
},
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      comment: "Дата и время создания платежа"
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      comment: "Дата и время последнего обновления информации о платеже"
    },
    completed_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Дата и время успешного завершения платежа"
    },
    ip_address: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "IP-адрес, с которого был создан платеж"
    },
    user_agent: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "User-Agent браузера, с которого был создан платеж"
    },
    payment_method: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Метод оплаты, выбранный пользователем (карта, эл. кошелек и т.д.)"
    },
    payment_details: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: "Дополнительные детали платежа (в формате JSON)"
    },
    currency: {
      type: DataTypes.STRING,
      defaultValue: 'RUB',
      comment: "Валюта платежа (ISO код)"
    },
    notified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Было ли отправлено уведомление пользователю о статусе платежа"
    },
    promo_code: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Промокод, примененный при оплате (если был)"
    },
    discount_amount: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0.00,
      comment: "Сумма скидки (если был применен промокод)"
    },
    original_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: "Изначальная сумма до применения скидки"
    },
    webhook_received: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Был ли получен webhook от платежной системы"
    },
    webhook_data: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: "Данные, полученные из webhook платежной системы"
    }
  }, {
    timestamps: true,
    underscored: true,
    tableName: 'payments',
    indexes: [
      {
        fields: ['user_id']
      },
      {
        fields: ['status']
      },
      {
        fields: ['payment_id']
      },
      {
        fields: ['created_at']
      },
      {
        fields: ['completed_at']
      }
    ]
  });

  // Ассоциации
  Payment.associate = (models) => {
    Payment.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    });
    
    Payment.hasOne(models.Transaction, {
      foreignKey: 'payment_id',
      as: 'transaction'
    });
    
    Payment.belongsTo(models.PromoCode, {
  foreignKey: 'promo_code_id',
  as: 'promoCode'
});
  };

  return Payment;
};