'use strict';
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const LeaderboardEntry = sequelize.define('LeaderboardEntry', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    leaderboard_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'leaderboards',
        key: 'id'
      },
      comment: "ID таблицы лидеров, к которой относится запись"
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      },
      comment: "ID пользователя"
    },
    rank: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "Ранг пользователя в таблице лидеров"
    },
    score: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0,
      comment: "Очки пользователя (может быть количеством или стоимостью в зависимости от типа таблицы)"
    },
    prev_rank: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Предыдущий ранг пользователя для отслеживания изменений"
    },
    value_change: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: true,
      comment: "Изменение значения по сравнению с предыдущим периодом"
    },
    details: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: "Детали достижения (например, статистика по типам предметов)"
    },
    rewards_claimed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Получил ли пользователь награду за место в таблице лидеров"
    },
    reward_claim_date: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Дата получения награды"
    },
    snapshot_data: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: "Снапшот данных пользователя на момент записи (уровень, имя и т.д.)"
    }
  }, {
    timestamps: true,
    underscored: true,
    tableName: 'leaderboard_entries',
    indexes: [
      {
        fields: ['leaderboard_id']
      },
      {
        fields: ['user_id']
      },
      {
        fields: ['rank']
      },
      {
        fields: ['leaderboard_id', 'user_id'],
        unique: true
      },
      {
        fields: ['leaderboard_id', 'rank'],
        unique: true
      }
    ]
  });

  // Ассоциации
  LeaderboardEntry.associate = (models) => {
    LeaderboardEntry.belongsTo(models.Leaderboard, {
      foreignKey: 'leaderboard_id',
      as: 'leaderboard'
    });

    LeaderboardEntry.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    });
  };

  return LeaderboardEntry;
};
