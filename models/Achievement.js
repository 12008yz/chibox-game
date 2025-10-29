'use strict';
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Achievement = sequelize.define('Achievement', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: "Название достижения"
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
      comment: "Описание достижения, что требуется сделать"
    },
    xp_reward: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Количество XP, которое получает пользователь за выполнение достижения"
    },
    icon_url: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "URL иконки достижения"
    },
    requirement_type: {
      type: DataTypes.ENUM(
        'cases_opened',           // Количество открытых кейсов
        'rare_items_found',       // Количество редких предметов
        'premium_items_found',    // Предметы стоимостью от 100 руб
        'subscription_days',      // Дни с активной подпиской
        'daily_streak',           // Дни подряд с открытием кейса
        'total_items_value',      // Общая стоимость предметов
        'best_item_value',        // Самый дорогой предмет
        'exchange_item',          // Обмен предметов на подписку
        'slot_plays',             // Количество игр в слоты
        'legendary_item_found',   // Получение легендарного предмета
        'total_sold_value',       // Общая стоимость проданных предметов
        'upgrade_success',        // Успешные улучшения предметов
        'level_reached',          // Достижение уровня
        'roulette_jackpot',       // Выигрыш джекпота в рулетке
        'night_case_opened',      // Открытие кейса ночью (2:00-4:00)
        'early_epic_item',        // Epic предмет из первых 5 кейсов
        'epic_streak',            // Серия редких предметов подряд
        'case_opening_streak'     // Серия дней открытия кейсов
      ),
      allowNull: false,
      comment: "Тип требования для получения достижения"
    },
    requirement_value: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "Требуемое значение для получения достижения"
    },
    bonus_percentage: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0.0,
      comment: "Бонус к вероятности выпадения ценных предметов в процентах"
    },
    min_item_price_for_bonus: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 100.00,
      comment: "Минимальная стоимость предмета, для которого действует бонус"
    },
    is_visible: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: "Видимо ли достижение до его получения"
    },
    category: {
      type: DataTypes.ENUM(
        'beginner',    // Достижения для новичков
        'collector',   // Коллекционирование предметов
        'regular',     // Регулярная активность
        'expert',      // Экспертный уровень
        'legendary'    // Легендарные достижения
      ),
      allowNull: false,
      defaultValue: 'regular',
      comment: "Категория достижения"
    },
    display_order: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: "Порядок отображения в списке"
    },
    badge_color: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Цвет фона значка достижения (HEX)"
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: "Активно ли достижение (может ли быть получено)"
    }
  }, {
    timestamps: true,
    underscored: true,
    tableName: 'achievements',
    indexes: [
      {
        fields: ['requirement_type']
      },
      {
        fields: ['category']
      },
      {
        fields: ['is_active']
      },
      {
        fields: ['display_order']
      }
    ]
  });

  // Связи
  Achievement.associate = (models) => {
    Achievement.hasMany(models.UserAchievement, {
      foreignKey: 'achievement_id',
      as: 'user_achievements'
    });
  };

  return Achievement;
};
