'use strict';
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const User = sequelize.define('User', {
    // Базовая информация и аутентификация
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    username: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        len: [3, 30]
      }
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true
      }
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false
    },
    role: {
      type: DataTypes.ENUM('user', 'moderator', 'admin', 'superadmin'),
      defaultValue: 'user',
      allowNull: false,
      comment: "Роль пользователя в системе"
    },
    is_email_verified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Подтвержден ли email"
    },
    email_verification_token: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Токен для подтверждения email"
    },
    email_verification_expires: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Срок действия токена подтверждения email"
    },
    verification_code: {
      type: DataTypes.STRING(6),
      allowNull: true,
      comment: "Код подтверждения email (6 цифр)"
    },
    password_reset_token: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Токен для сброса пароля"
    },
    password_reset_expires: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Срок действия токена сброса пароля"
    },
    tfa_enabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Включена ли двухфакторная аутентификация"
    },
    tfa_secret: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Секрет для двухфакторной аутентификации"
    },
    tfa_backup_codes: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
      comment: "Резервные коды для двухфакторной аутентификации"
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    is_banned: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    ban_reason: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Причина блокировки"
    },
    ban_expires: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Дата окончания временной блокировки (null - бессрочно)"
    },

    level: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
      comment: "Текущий уровень пользователя"
    },
    xp: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Текущее количество опыта пользователя"
    },
    xp_to_next_level: {
      type: DataTypes.INTEGER,
      defaultValue: 100,
      comment: "Количество XP, необходимое для перехода на следующий уровень"
    },
    level_bonus_percentage: {
      type: DataTypes.FLOAT,
      defaultValue: 0.0,
      comment: "Бонус к выпадению предметов от уровня пользователя (в %)"
    },
    total_xp_earned: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Общее количество XP, заработанное пользователем за все время"
    },
    // Steam интеграция (удалено дублирование, используется блок ниже)

    // Подписка (30 дней)
    subscription_tier: {
      type: DataTypes.INTEGER,
      defaultValue: 0, // 0 - нет подписки, 1 - Статус, 2 - Статус+, 3 - Статус++
      validate: {
        min: 0,
        max: 3
      }
    },
    subscription_purchase_date: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Дата покупки подписки"
    },
    subscription_expiry_date: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Дата истечения подписки (30 дней от даты покупки)"
    },
    subscription_days_left: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Число дней подписки, которые остались у пользователя"
    },

    // Ежедневные кейсы
    cases_available: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Количество доступных кейсов для открытия"
    },
    cases_opened_today: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Количество кейсов, открытых сегодня"
    },
    total_cases_opened: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Общее количество открытых кейсов за всю историю"
    },
    next_case_available_time: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Время, когда будет доступен следующий ежедневный кейс"
    },
    paid_cases_bought_today: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
      comment: "Количество покупных кейсов, купленных сегодня"
    },
    max_daily_cases: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Максимальное количество кейсов в день (зависит от подписки)"
    },
    last_reset_date: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Дата последнего сброса счетчика открытых кейсов"
    },

    // Бонус (раз в 48 часов)
    next_bonus_available_time: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Время, когда будет доступен следующий бонус"
    },
    last_bonus_date: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Дата последнего полученного бонуса"
    },
    lifetime_bonuses_claimed: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Общее количество полученных бонусов"
    },
    successful_bonus_claims: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Количество успешных угадываний ячеек"
    },

    // Достижения и модификатор выпадения предметов
    drop_rate_modifier: {
      type: DataTypes.FLOAT,
      defaultValue: 1.0,
      comment: "Базовый модификатор вероятности выпадения редких предметов"
    },
    achievements_bonus_percentage: {
      type: DataTypes.FLOAT,
      defaultValue: 0.0,
      comment: "Суммарный бонус в процентах от достижений (например, 5.5 = +5.5%)"
    },
    subscription_bonus_percentage: {
      type: DataTypes.FLOAT,
      defaultValue: 0.0,
      comment: "Бонус в процентах от подписки (например, 3.0 = +3% для Статус+)"
    },
    total_drop_bonus_percentage: {
      type: DataTypes.FLOAT,
      defaultValue: 0.0,
      comment: "Общий бонус к выпадению предметов (сумма бонусов от достижений, подписки и уровня)"
    },

    // Финансы
    balance: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0.00,
      comment: "Баланс пользователя (для покупки подписки, продажи предметов и т.д.)"
    },

    // Статистика
    total_items_value: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0.00,
      comment: "Общая стоимость полученных предметов"
    },
    best_item_value: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0.00,
      comment: "Стоимость самого дорогого полученного предмета"
    },
    daily_streak: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Текущая серия дней подряд с открытием кейса"
    },
    max_daily_streak: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Максимальная серия дней подряд с открытием кейса"
    },
    subscription_days_left: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Прошедшее количество дней подписки"
    },
    registration_date: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      comment: "Дата регистрации пользователя"
    },
    last_login_date: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Дата последнего входа пользователя"
    },

    // Steam OAuth интеграция
    steam_id: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
      comment: "Steam ID пользователя для OAuth авторизации"
    },
    steam_profile: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: "Данные профиля Steam (аватар, никнейм и т.д.)"
    },
    steam_avatar: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "URL аватара Steam"
    },
    steam_profile_url: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "URL профиля Steam"
    },
    steam_trade_url: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "URL для обмена Steam (нужен для вывода предметов)"
    },
    auth_provider: {
      type: DataTypes.ENUM('local', 'steam'),
      defaultValue: 'local',
      allowNull: false,
      comment: "Провайдер авторизации (local для обычной регистрации, steam для Steam OAuth)"
    }
  }, {
    timestamps: true, // Создаст createdAt и updatedAt
    underscored: true, // Использует snake_case для полей в БД
    tableName: 'users',
    indexes: [
      {
        fields: ['email'],
        unique: true
      },
      {
        fields: ['username'],
        unique: true
      },
      {
        fields: ['steam_id'],
        unique: true
      },
      {
        fields: ['subscription_tier']
      },
      {
        fields: ['subscription_expiry_date']
      }
    ]
  });

  // Ассоциации
  User.associate = (models) => {
    User.hasMany(models.Case, {
      foreignKey: 'user_id',
      as: 'cases'
    });

    User.hasMany(models.UserInventory, {
      foreignKey: 'user_id',
      as: 'inventory'
    });

    User.hasMany(models.UserAchievement, {
      foreignKey: 'user_id',
      as: 'achievements'
    });

    User.hasMany(models.Transaction, {
      foreignKey: 'user_id',
      as: 'transactions'
    });

    User.hasMany(models.XpTransaction, {
      foreignKey: 'user_id',
      as: 'xp_transactions'
    });

    User.hasMany(models.Payment, {
      foreignKey: 'user_id',
      as: 'payments'
    });

    User.hasMany(models.LiveDrop, {
      foreignKey: 'user_id',
      as: 'live_drops'
    });

    User.hasMany(models.Withdrawal, {
      foreignKey: 'user_id',
      as: 'withdrawals'
    });

    User.hasMany(models.PromoCodeUsage, {
      foreignKey: 'user_id',
      as: 'promo_code_usages'
    });

    User.hasMany(models.PromoCodeUser, {
      foreignKey: 'user_id',
      as: 'available_promo_codes'
    });

    User.hasMany(models.Notification, {
      foreignKey: 'user_id',
      as: 'notifications'
    });
  };

  return User;
};
