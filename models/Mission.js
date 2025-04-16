'use strict';
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Mission = sequelize.define('Mission', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: "Название миссии"
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Описание миссии"
    },
    icon_url: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "URL иконки миссии"
    },
    type: {
      type: DataTypes.ENUM('daily', 'weekly', 'achievement', 'special', 'onetime', 'event'),
      allowNull: false,
      defaultValue: 'daily',
      comment: "Тип миссии"
    },
    status: {
      type: DataTypes.ENUM('active', 'disabled', 'expired', 'upcoming'),
      allowNull: false,
      defaultValue: 'active',
      comment: "Статус миссии"
    },
    difficulty: {
      type: DataTypes.ENUM('easy', 'medium', 'hard', 'extreme'),
      allowNull: false,
      defaultValue: 'easy',
      comment: "Сложность миссии"
    },
    action_type: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: "Тип действия (open_cases, get_rare_items, login_streak, etc.)"
    },
    required_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      comment: "Требуемое количество для выполнения"
    },
    min_subscription_tier: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Минимальный уровень подписки для доступа к миссии (0 - без подписки)"
    },
    min_level: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
      comment: "Минимальный уровень пользователя для доступа к миссии"
    },
    start_date: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Дата начала миссии (null - всегда доступна)"
    },
    end_date: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Дата окончания миссии (null - бессрочно)"
    },
    condition_config: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
      comment: "Конфигурация условий выполнения миссии в формате JSON"
    },
    reward_config: {
      type: DataTypes.JSONB,
      allowNull: false,
      comment: "Конфигурация наград за выполнение миссии в формате JSON"
    },
    xp_reward: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Количество XP за выполнение миссии"
    },
    reset_period: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Период сброса в часах (null - без сброса, разовая миссия)"
    },
    has_progress: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: "Имеет ли миссия прогресс или это единичное действие"
    },
    is_hidden: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Скрыта ли миссия до выполнения определенных условий"
    },
    hidden_condition_config: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: "Условия для показа скрытой миссии в формате JSON"
    },
    order: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Порядок отображения миссии"
    },
    group_id: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "ID группы миссий (для связанных миссий)"
    },
    is_sequential: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Является ли частью последовательности миссий"
    },
    next_mission_id: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "ID следующей миссии в последовательности"
    },
    unlockable_content_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'unlockable_contents',
        key: 'id'
      },
      comment: "ID разблокируемого контента, связанного с этой миссией"
    }
  }, {
    timestamps: true,
    underscored: true,
    tableName: 'missions',
    indexes: [
      {
        fields: ['type']
      },
      {
        fields: ['status']
      },
      {
        fields: ['action_type']
      },
      {
        fields: ['min_subscription_tier']
      },
      {
        fields: ['min_level']
      },
      {
        fields: ['start_date', 'end_date']
      },
      {
        fields: ['is_hidden']
      },
      {
        fields: ['group_id']
      },
      {
        fields: ['order']
      }
    ]
  });

  // Ассоциации
  Mission.associate = (models) => {
    Mission.hasMany(models.UserMission, {
      foreignKey: 'mission_id',
      as: 'user_missions'
    });

    Mission.belongsTo(Mission, {
      foreignKey: 'next_mission_id',
      as: 'next_mission'
    });

    Mission.hasOne(Mission, {
      foreignKey: 'next_mission_id',
      as: 'previous_mission'
    });

    Mission.belongsTo(models.UnlockableContent, {
      foreignKey: 'unlockable_content_id',
      as: 'unlockable_content'
    });
  };

  return Mission;
};
