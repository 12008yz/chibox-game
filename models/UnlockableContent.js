'use strict';
const { DataTypes, Op } = require('sequelize');

module.exports = (sequelize) => {
  const UnlockableContent = sequelize.define('UnlockableContent', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: "Название разблокируемого контента"
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Описание разблокируемого контента"
    },
    type: {
      type: DataTypes.ENUM('case', 'item', 'achievement', 'feature', 'bonus', 'skin', 'special_event', 'other'),
      allowNull: false,
      comment: "Тип разблокируемого контента"
    },
    image_url: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "URL изображения контента"
    },
    teaser_image_url: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "URL изображения-тизера (показывается до разблокировки)"
    },
    status: {
      type: DataTypes.ENUM('active', 'inactive', 'coming_soon', 'expired'),
      defaultValue: 'active',
      comment: "Статус разблокируемого контента"
    },
    unlock_conditions: {
      type: DataTypes.JSONB,
      allowNull: false,
      comment: "Условия разблокировки в формате JSON (например, достижения, уровень, события)"
    },
    unlock_progress_config: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: "Конфигурация отслеживания прогресса разблокировки"
    },
    reward_config: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: "Конфигурация награды за разблокировку"
    },
    related_item_id: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "ID связанного предмета, если контент является предметом"
    },
    related_case_template_id: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "ID связанного шаблона кейса, если контент является кейсом"
    },
    min_level: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
      comment: "Минимальный уровень пользователя для разблокировки"
    },
    min_subscription_tier: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Минимальный уровень подписки для разблокировки (0 - без подписки)"
    },
    start_date: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Дата начала доступности контента"
    },
    end_date: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Дата окончания доступности контента"
    },
    difficulty: {
      type: DataTypes.ENUM('easy', 'medium', 'hard', 'extreme'),
      defaultValue: 'medium',
      comment: "Сложность разблокировки контента"
    },
    display_order: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Порядок отображения в интерфейсе"
    },
    is_hidden: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Скрыт ли контент до выполнения определенных условий"
    },
    hidden_conditions: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: "Условия для отображения скрытого контента"
    },
    is_premium: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Является ли контент премиум-контентом"
    },
    custom_code: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Пользовательский код для контента (для интеграции с кодом)"
    },
    feature_flags: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: [],
      comment: "Флаги для дополнительных функций"
    },
    meta_data: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: "Метаданные для контента"
    }
  }, {
    timestamps: true,
    underscored: true,
    tableName: 'unlockable_contents',
    indexes: [
      {
        fields: ['type']
      },
      {
        fields: ['status']
      },
      {
        fields: ['min_level']
      },
      {
        fields: ['min_subscription_tier']
      },
      {
        fields: ['start_date', 'end_date']
      },
      {
        fields: ['is_premium']
      },
      {
        fields: ['display_order']
      },
      {
        fields: ['custom_code'],
        unique: true,
        where: {
          custom_code: {
            [sequelize.Op.ne]: null
          }
        }
      }
    ]
  });

  // Ассоциации
  UnlockableContent.associate = (models) => {
    UnlockableContent.hasMany(models.UserUnlockableContent, {
      foreignKey: 'content_id',
      as: 'user_unlocks'
    });

    if (models.Item) {
      UnlockableContent.belongsTo(models.Item, {
        foreignKey: 'related_item_id',
        as: 'related_item'
      });
    }

    if (models.CaseTemplate) {
      UnlockableContent.belongsTo(models.CaseTemplate, {
        foreignKey: 'related_case_template_id',
        as: 'related_case_template'
      });
    }

    if (models.Mission) {
      UnlockableContent.hasMany(models.Mission, {
        foreignKey: 'unlockable_content_id',
        as: 'missions'
      });
    }
  };

  return UnlockableContent;
};
