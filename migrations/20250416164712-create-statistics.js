'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('statistics', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      // Общая статистика сайта
      total_users: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "Общее количество пользователей"
      },
      active_users_today: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "Активных пользователей сегодня"
      },
      active_users_week: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "Активных пользователей за неделю"
      },
      active_users_month: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "Активных пользователей за месяц"
      },

      // Статистика кейсов
      total_cases_opened: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "Общее количество открытых кейсов"
      },
      cases_opened_today: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "Кейсов открыто сегодня"
      },
      cases_opened_week: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "Кейсов открыто за неделю"
      },
      cases_opened_month: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "Кейсов открыто за месяц"
      },

      // Статистика предметов и стоимости
      total_items_dropped: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "Общее количество выпавших предметов"
      },
      total_items_value: {
        type: Sequelize.DECIMAL(15, 2),
        defaultValue: 0.00,
        comment: "Общая стоимость выпавших предметов"
      },
      average_item_value: {
        type: Sequelize.DECIMAL(10, 2),
        defaultValue: 0.00,
        comment: "Средняя стоимость выпавшего предмета"
      },
      highest_value_item_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: "ID самого дорого предмета, выпавшего из кейса"
      },
      highest_value_drop: {
        type: Sequelize.DECIMAL(10, 2),
        defaultValue: 0.00,
        comment: "Стоимость самого дорогого выпавшего предмета"
      },

      // Статистика по редкости
      common_items_dropped: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "Выпало обычных предметов"
      },
      uncommon_items_dropped: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "Выпало необычных предметов"
      },
      rare_items_dropped: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "Выпало редких предметов"
      },
      epic_items_dropped: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "Выпало эпических предметов"
      },
      legendary_items_dropped: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "Выпало легендарных предметов"
      },
      mythical_items_dropped: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "Выпало мифических предметов"
      },

      // Финансовая статистика
      total_deposits: {
        type: Sequelize.DECIMAL(15, 2),
        defaultValue: 0.00,
        comment: "Общая сумма пополнений"
      },
      total_withdrawals: {
        type: Sequelize.DECIMAL(15, 2),
        defaultValue: 0.00,
        comment: "Общая сумма выводов"
      },
      total_purchases: {
        type: Sequelize.DECIMAL(15, 2),
        defaultValue: 0.00,
        comment: "Общая сумма покупок (кейсы, подписки)"
      },
      revenue_today: {
        type: Sequelize.DECIMAL(12, 2),
        defaultValue: 0.00,
        comment: "Доход за сегодня"
      },
      revenue_week: {
        type: Sequelize.DECIMAL(12, 2),
        defaultValue: 0.00,
        comment: "Доход за неделю"
      },
      revenue_month: {
        type: Sequelize.DECIMAL(15, 2),
        defaultValue: 0.00,
        comment: "Доход за месяц"
      },
      revenue_total: {
        type: Sequelize.DECIMAL(15, 2),
        defaultValue: 0.00,
        comment: "Общий доход за все время"
      },

      // Статистика подписок
      users_with_subscription: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "Пользователей с активной подпиской"
      },
      tier1_subscriptions: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "Подписок 1 уровня"
      },
      tier2_subscriptions: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "Подписок 2 уровня"
      },
      tier3_subscriptions: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "Подписок 3 уровня"
      },
      subscription_revenue: {
        type: Sequelize.DECIMAL(12, 2),
        defaultValue: 0.00,
        comment: "Доход от подписок"
      },

      // Статистика по категориям кейсов
      daily_cases_opened: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "Открыто ежедневных кейсов"
      },
      premium_cases_opened: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "Открыто премиум кейсов"
      },
      event_cases_opened: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "Открыто событийных кейсов"
      },
      special_cases_opened: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "Открыто специальных кейсов"
      },
      achievement_cases_opened: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "Открыто кейсов за достижения"
      },

      // Периодические обновления
      last_daily_update: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Последнее ежедневное обновление статистики"
      },
      last_weekly_update: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Последнее еженедельное обновление статистики"
      },
      last_monthly_update: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Последнее ежемесячное обновление статистики"
      },
      last_calculated: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
        comment: "Последний раз, когда статистика была пересчитана"
      },

      // Прочая статистика
      achievements_unlocked: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "Разблокировано достижений"
      },
      missions_completed: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "Выполнено миссий"
      },
      promo_codes_used: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "Использовано промокодов"
      },
      total_bonus_claims: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "Получено бонусов"
      },
      total_level_ups: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "Общее количество повышений уровня пользователей"
      },

      // Дополнительные метрики
      custom_metrics: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: "Дополнительные пользовательские метрики в формате JSON"
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });

    // Добавление индексов
    await queryInterface.addIndex('statistics', ['last_calculated']);

    // Добавление внешнего ключа для highest_value_item_id
    await queryInterface.addConstraint('statistics', {
      fields: ['highest_value_item_id'],
      type: 'foreign key',
      name: 'statistics_highest_value_item_fkey',
      references: {
        table: 'items',
        field: 'id'
      },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeConstraint('statistics', 'statistics_highest_value_item_fkey');
    await queryInterface.dropTable('statistics');
  }
};
