'use strict';
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const UserMission = sequelize.define('UserMission', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
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
    mission_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'missions',
        key: 'id'
      },
      comment: "ID миссии"
    },
    progress: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Текущий прогресс выполнения миссии"
    },
    is_completed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Выполнена ли миссия"
    },
    completion_date: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Дата выполнения миссии"
    },
    rewards_claimed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Получена ли награда за выполнение миссии"
    },
    reward_claim_date: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Дата получения награды"
    },
    unlock_date: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      comment: "Дата разблокировки миссии для пользователя"
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Срок действия миссии для пользователя (для временных миссий)"
    },
    last_reset_date: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Дата последнего сброса прогресса (для повторяющихся миссий)"
    },
    times_completed: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Сколько раз миссия была выполнена (для повторяющихся миссий)"
    },
    data: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: "Дополнительные данные о выполнении миссии в формате JSON"
    },
    last_updated: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      comment: "Дата последнего обновления прогресса"
    }
  }, {
    timestamps: true,
    underscored: true,
    tableName: 'user_missions',
    indexes: [
      {
        fields: ['user_id']
      },
      {
        fields: ['mission_id']
      },
      {
        fields: ['is_completed']
      },
      {
        fields: ['rewards_claimed']
      },
      {
        fields: ['expires_at']
      },
      {
        fields: ['user_id', 'mission_id'],
        unique: true
      }
    ]
  });

  // Ассоциации
  UserMission.associate = (models) => {
    UserMission.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    });

    UserMission.belongsTo(models.Mission, {
      foreignKey: 'mission_id',
      as: 'mission'
    });
  };

  return UserMission;
};
