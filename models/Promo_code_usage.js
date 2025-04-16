'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const PromoCodeUsage = sequelize.define('PromoCodeUsage', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    promo_code_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'promo_codes',
        key: 'id'
      },
      comment: "ID промокода, который был использован"
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      },
      comment: "ID пользователя, который использовал промокод"
    },
    usage_date: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      comment: "Дата и время использования промокода"
    },
    applied_value: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.00,
      comment: "Фактическое примененное значение промокода (сумма скидки, бонуса и т.д.)"
    },
    original_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: "Исходная сумма платежа или стоимость до применения промокода"
    },
    final_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: "Итоговая сумма после применения промокода"
    },
    ip_address: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "IP-адрес, с которого был использован промокод"
    },
    user_agent: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "User-Agent браузера, с которого был использован промокод"
    },
    payment_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'payments',
        key: 'id'
      },
      comment: "ID платежа, в котором был использован промокод (если применимо)"
    },
    subscription_id: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "ID подписки, к которой был применен промокод (если применимо)"
    },
    cases_added: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Количество добавленных кейсов (для 'case_bonus')"
    },
    subscription_days_added: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Количество добавленных дней подписки (для 'subscription_extend')"
    },
    drop_rate_boost_percentage: {
      type: DataTypes.FLOAT,
      allowNull: true,
      comment: "Процент увеличения шанса выпадения редких предметов (для 'drop_rate_boost')"
    },
    boost_expiry_date: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Дата истечения временного буста (для 'drop_rate_boost')"
    },
    status: {
      type: DataTypes.ENUM('applied', 'cancelled', 'refunded', 'expired'),
      defaultValue: 'applied',
      comment: "Статус применения промокода"
    }
  }, {
    timestamps: true,
    underscored: true,
    tableName: 'promo_code_usages',
    indexes: [
      {
        fields: ['promo_code_id']
      },
      {
        fields: ['user_id']
      },
      {
        fields: ['usage_date']
      },
      {
        fields: ['promo_code_id', 'user_id']
      },
      {
        fields: ['payment_id']
      },
      {
        fields: ['status']
      }
    ]
  });

  // Ассоциации
  PromoCodeUsage.associate = (models) => {
    PromoCodeUsage.belongsTo(models.PromoCode, {
      foreignKey: 'promo_code_id',
      as: 'promo_code'
    });
    
    PromoCodeUsage.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    });
    
    PromoCodeUsage.belongsTo(models.Payment, {
      foreignKey: 'payment_id',
      as: 'payment'
    });
  };

  return PromoCodeUsage;
};