'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const PromoCode = sequelize.define('PromoCode', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    code: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      comment: "Код промокода (например, 'BONUS50', 'WELCOME10')"
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Описание промокода, его назначение"
    },
    type: {
      type: DataTypes.ENUM(
        'balance_add',           // Добавление фиксированной суммы к балансу
        'balance_percentage',    // Добавление процента от суммы пополнения
        'subscription_discount', // Скидка на подписку
        'subscription_extend',   // Продление подписки
        'case_bonus',            // Бонусные кейсы
        'drop_rate_boost'        // Временное увеличение шанса выпадения редких предметов
      ),
      allowNull: false,
      comment: "Тип промокода, определяющий его эффект"
    },
    value: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.00,
      comment: "Значение промокода (сумма в рублях, процент скидки, количество дней/кейсов)"
    },
    is_percentage: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Является ли значение процентом (например, 10%)"
    },
    min_payment_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: "Минимальная сумма пополнения для применения промокода"
    },
    max_discount_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: "Максимальная сумма скидки при использовании процентного промокода"
    },
    start_date: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      comment: "Дата начала действия промокода"
    },
    end_date: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Дата окончания действия промокода (null = бессрочный)"
    },
    max_usages: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Максимальное количество использований промокода (null = неограниченно)"
    },
    max_usages_per_user: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
      comment: "Максимальное количество использований промокода одним пользователем"
    },
    usage_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Текущее количество использований промокода"
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: "Активен ли промокод"
    },
    subscription_tier: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Уровень подписки, к которому применяется промокод (null = ко всем)"
    },
    created_by_admin_id: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "ID администратора, создавшего промокод"
    },
    required_user_type: {
      type: DataTypes.ENUM('new', 'returning', 'subscribed', 'any'),
      defaultValue: 'any',
      comment: "Тип пользователя, которому доступен промокод (новый, возвращающийся, с подпиской, любой)"
    },
    min_user_level: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Минимальный уровень пользователя для использования промокода"
    },
    is_hidden: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Скрытый промокод (не отображается в списках, но работает)"
    },
    for_specific_users: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Промокод для конкретных пользователей (определенных в PromoCodeUser)"
    },
    applies_to_payment_systems: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: "Список платежных систем, к которым применяется промокод (null = все)"
    },
    color_code: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Цветовой код для отображения промокода (HEX)"
    },
    icon_url: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "URL иконки промокода"
    },
    category: {
      type: DataTypes.ENUM('deposit', 'general'),
      defaultValue: 'general',
      comment: "Категория промокода: deposit - для пополнения баланса, general - обычные промокоды"
    },
    streamer_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'streamers', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
      comment: "Промокод стримера (создан для партнёрской программы)"
    }
  }, {
    timestamps: true,
    underscored: true,
    tableName: 'promo_codes',
    indexes: [
      {
        fields: ['code'],
        unique: true
      },
      {
        fields: ['is_active']
      },
      {
        fields: ['start_date']
      },
      {
        fields: ['end_date']
      },
      {
        fields: ['type']
      },
      {
        fields: ['subscription_tier']
      }
    ]
  });

  // Ассоциации
  PromoCode.associate = (models) => {
    PromoCode.hasMany(models.PromoCodeUsage, {
      foreignKey: 'promo_code_id',
      as: 'usages'
    });

    PromoCode.hasMany(models.Payment, {
      foreignKey: 'promo_code_id',
      as: 'payments'
    });

    // Если у вас будет модель для связи промокодов с конкретными пользователями
    PromoCode.hasMany(models.PromoCodeUser, {
      foreignKey: 'promo_code_id',
      as: 'allowed_users'
    });

    PromoCode.belongsTo(models.Streamer, {
      foreignKey: 'streamer_id',
      as: 'streamer'
    });
  };

  return PromoCode;
};
