'use strict';
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Leaderboard = sequelize.define('Leaderboard', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    type: {
      type: DataTypes.ENUM('cases_opened', 'items_value', 'rare_items', 'subscription_days', 'level', 'achievements'),
      allowNull: false,
      comment: "Тип таблицы лидеров"
    },
    period: {
      type: DataTypes.ENUM('daily', 'weekly', 'monthly', 'alltime'),
      allowNull: false,
      defaultValue: 'alltime',
      comment: "Период таблицы лидеров"
    },
    period_start: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Дата начала периода (для конкретного периода)"
    },
    period_end: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Дата окончания периода (для конкретного периода)"
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: "Активна ли таблица лидеров"
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: "Название таблицы лидеров"
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Описание таблицы лидеров"
    },
    reward_config: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: "Конфигурация наград для призовых мест в формате JSON"
    },
    display_limit: {
      type: DataTypes.INTEGER,
      defaultValue: 100,
      comment: "Количество отображаемых мест в таблице лидеров"
    },
    last_updated: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      comment: "Дата последнего обновления таблицы лидеров"
    }
  }, {
    timestamps: true,
    underscored: true,
    tableName: 'leaderboards',
    indexes: [
      {
        fields: ['type']
      },
      {
        fields: ['period']
      },
      {
        fields: ['is_active']
      },
      {
        fields: ['type', 'period'],
        unique: true,
        where: {
          is_active: true,
          period: 'alltime'
        }
      }
    ]
  });

  // Ассоциации
  Leaderboard.associate = (models) => {
    Leaderboard.hasMany(models.LeaderboardEntry, {
      foreignKey: 'leaderboard_id',
      as: 'entries'
    });
  };

  return Leaderboard;
};
