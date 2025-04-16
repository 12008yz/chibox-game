'use strict';
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const CaseTemplate = sequelize.define('CaseTemplate', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: "Название шаблона кейса"
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Описание кейса"
    },
    image_url: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "URL изображения кейса"
    },
    animation_url: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "URL анимации открытия кейса"
    },
    type: {
      type: DataTypes.ENUM('daily', 'premium', 'event', 'special', 'achievement'),
      allowNull: false,
      defaultValue: 'daily',
      comment: "Тип кейса (ежедневный, премиум, событийный, специальный, награда за достижение)"
    },
    min_subscription_tier: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Минимальный уровень подписки для доступа к кейсу (0 - без подписки)"
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: "Активен ли кейс в системе"
    },
    availability_start: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Дата начала доступности кейса (для временных кейсов)"
    },
    availability_end: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Дата окончания доступности кейса (для временных кейсов)"
    },
    max_opens_per_user: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Максимальное количество открытий на пользователя (null - без ограничений)"
    },
    cooldown_hours: {
      type: DataTypes.INTEGER,
      defaultValue: 24,
      comment: "Период ожидания между выдачами кейса в часах"
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: "Цена кейса в рублях (null - бесплатный)"
    },
    item_pool_config: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
      comment: "Конфигурация пула предметов и шансов выпадения в формате JSON"
    },
    special_conditions: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: "Особые условия для получения кейса (например, минимальный уровень) в формате JSON"
    },
    sort_order: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Порядок сортировки в интерфейсе (чем меньше значение, тем выше в списке)"
    },
    color_scheme: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Цветовая схема для отображения кейса в интерфейсе"
    },
    guaranteed_min_value: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: "Гарантированная минимальная стоимость выпадающего предмета"
    }
  }, {
    timestamps: true,
    underscored: true,
    tableName: 'case_templates',
    indexes: [
      {
        fields: ['type']
      },
      {
        fields: ['is_active']
      },
      {
        fields: ['min_subscription_tier']
      },
      {
        fields: ['availability_start', 'availability_end']
      },
      {
        fields: ['sort_order']
      }
    ]
  });

  // Ассоциации
  CaseTemplate.associate = (models) => {
    CaseTemplate.hasMany(models.Case, {
      foreignKey: 'template_id',
      as: 'cases'
    });
  };

  return CaseTemplate;
};
