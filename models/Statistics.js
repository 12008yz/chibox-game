'use strict';
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Statistics = sequelize.define('Statistics', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    // Общая статистика сайта
    total_users: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Общее количество пользователей"
    },
    active_users_today: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Активных пользователей сегодня"
    },
    active_users_week: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Активных пользователей за неделю"
    },
    active_users_month: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Активных пользователей за месяц"
    },

    // Статистика кейсов
    total_cases_opened: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Общее количество открытых кейсов"
    },
    cases_opened_today: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Кейсов открыто сегодня"
    },
    cases_opened_week: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Кейсов открыто за неделю"
    },
    cases_opened_month: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Кейсов открыто за месяц"
    },

    // Статистика предметов и стоимости
    total_items_dropped: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Общее количество выпавших предметов"
    },
    total_items_value: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00,
      comment: "Общая стоимость выпавших предметов"
    },
    average_item_value: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0.00,
      comment: "Средняя стоимость выпавшего предмета"
    },
    highest_value_item_id: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "ID самого дорого предмета, выпавшего из кейса"
    },
    highest_value_drop: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0.00,
      comment: "Стоимость самого дорогого выпавшего предмета"
    },

    // Статистика по редкости
    common_items_dropped: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Выпало обычных предметов"
    },
    uncommon_items_dropped: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Выпало необычных предметов"
    },
    rare_items_dropped: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Выпало редких предметов"
    },
    epic_items_dropped: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Выпало эпических предметов"
    },
    legendary_items_dropped: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Выпало легендарных предметов"
    },
    mythical_items_dropped: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Выпало мифических предметов"
    },

    // Финансовая статистика
    total_deposits: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00,
      comment: "Общая сумма пополнений"
    },
    total_withdrawals: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00,
      comment: "Общая сумма выводов"
    },
    total_purchases: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00,
      comment: "Общая сумма покупок (кейсы, подписки)"
    },
    revenue_today: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0.00,
      comment: "Доход за сегодня"
    },
    revenue_week: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0.00,
      comment: "Доход за неделю"
    },
    revenue_month: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00,
      comment: "Доход за месяц"
    },
    revenue_total: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00,
      comment: "Общий доход за все время"
    },

    // Статистика подписок
    users_with_subscription: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Пользователей с активной подпиской"
    },
    tier1_subscriptions: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Подписок 1 уровня"
    },
    tier2_subscriptions: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Подписок 2 уровня"
    },
    tier3_subscriptions: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Подписок 3 уровня"
    },
    subscription_revenue: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0.00,
      comment: "Доход от подписок"
    },

    // Статистика по категориям кейсов
    daily_cases_opened: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Открыто ежедневных кейсов"
    },
    premium_cases_opened: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Открыто премиум кейсов"
    },
    event_cases_opened: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Открыто событийных кейсов"
    },
    special_cases_opened: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Открыто специальных кейсов"
    },
    achievement_cases_opened: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Открыто кейсов за достижения"
    },

    // Периодические обновления
    last_daily_update: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Последнее ежедневное обновление статистики"
    },
    last_weekly_update: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Последнее еженедельное обновление статистики"
    },
    last_monthly_update: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Последнее ежемесячное обновление статистики"
    },
    last_calculated: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      comment: "Последний раз, когда статистика была пересчитана"
    },

    // Прочая статистика
    achievements_unlocked: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Разблокировано достижений"
    },
    missions_completed: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Выполнено миссий"
    },
    promo_codes_used: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Использовано промокодов"
    },
    total_bonus_claims: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Получено бонусов"
    },
    total_level_ups: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Общее количество повышений уровня пользователей"
    },

    // Дополнительные метрики
    custom_metrics: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      comment: "Дополнительные пользовательские метрики в формате JSON"
    }
  }, {
    timestamps: true,
    underscored: true,
    tableName: 'statistics',
    indexes: [
      {
        fields: ['last_calculated']
      }
    ]
  });

  // Ассоциации
  Statistics.associate = (models) => {
    if (models.Item) {
      Statistics.belongsTo(models.Item, {
        foreignKey: 'highest_value_item_id',
        as: 'highest_value_item'
      });
    }
  };

  return Statistics;
};
