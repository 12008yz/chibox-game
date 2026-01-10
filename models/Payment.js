'use strict';

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
      type: DataTypes.ENUM('ukassa', 'freekassa', 'alfabank', 'paypal', 'stripe', 'qiwi', 'webmoney', 'crypto', 'bank_card', 'sbp', 'mir', 'other'),
      allowNull: false,
      comment: "Платежная система, через которую совершается платеж"
    },
    status: {
      type: DataTypes.ENUM('created', 'pending', 'authorized', 'processing', 'completed', 'failed', 'cancelled', 'refunded', 'partially_refunded', 'dispute'),
      defaultValue: 'created',
      comment: "Статус платежа"
    },
    payment_id: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Внешний ID платежа в платежной системе"
    },
    payment_url: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "URL для оплаты (перенаправление пользователя)"
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Описание платежа"
    },
    purpose: {
      type: DataTypes.ENUM('deposit', 'subscription', 'case_purchase', 'vip', 'other'),
      allowNull: false,
      defaultValue: 'deposit',
      comment: "Назначение платежа"
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
    expires_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Время истечения неоплаченного платежа"
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
    refunded_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Дата и время возврата платежа"
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
      type: DataTypes.JSONB,
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
    notification_attempts: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Количество попыток уведомления пользователя"
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
      type: DataTypes.JSONB,
      allowNull: true,
      comment: "Данные, полученные из webhook платежной системы"
    },
    retry_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Количество попыток обработки платежа"
    },
    next_retry_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Время следующей попытки обработки"
    },
    fees: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0.00,
      comment: "Комиссия платежной системы"
    },
    net_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: "Чистая сумма после вычета комиссий"
    },
    receipt_url: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "URL на чек/квитанцию об оплате"
    },
    receipt_data: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: "Данные для формирования чека по 54-ФЗ"
    },
    subscription_id: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "ID подписки, оплаченной этим платежом"
    },
    case_purchase_ids: {
      type: DataTypes.ARRAY(DataTypes.UUID),
      allowNull: true,
      comment: "ID кейсов, приобретенных этим платежом"
    },
    refund_reason: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Причина возврата средств"
    },
    refund_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: "Сумма возврата (если частичный возврат)"
    },
    is_test: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Тестовый платеж (не учитывается в статистике)"
    },
    admin_id: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "ID администратора, создавшего или изменившего платеж"
    },
    admin_notes: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Примечания администратора"
    },
    invoice_number: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      unique: true,
      allowNull: true,
      comment: "Числовой номер счета для платежных систем (например, Robokassa)"
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: "Дополнительные данные платежа (например, chicoins, tierId)"
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
      },
      {
        fields: ['purpose']
      },
      {
        fields: ['currency']
      },
      {
        fields: ['user_id', 'status']
      },
      {
        fields: ['promo_code_id']
      },
      {
        fields: ['subscription_id']
      },
      {
        fields: ['expires_at']
      }
    ],
    comment: "Таблица платежей"
  });

  Payment.rawAttributes.metadata = {
    type: require('sequelize').DataTypes.JSONB,
    allowNull: true,
    comment: 'Дополнительные данные платежа (например, tierId)'
  };
  Payment.refreshAttributes();

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

    if (models.Notification) {
      Payment.hasMany(models.Notification, {
        foreignKey: 'related_id',
        scope: {
          category: 'transaction'
        },
        as: 'notifications'
      });
    }

    // Только если модель User имеет поле admin_id
    if (models.User) {
      Payment.belongsTo(models.User, {
        foreignKey: 'admin_id',
        as: 'admin'
      });
    }
  };

  return Payment;
};
