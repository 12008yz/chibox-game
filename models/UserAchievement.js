'use strict';

module.exports = (sequelize, DataTypes) => {
  const UserAchievement = sequelize.define('UserAchievement', {
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
      }
    },
    achievement_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'achievements',
        key: 'id'
      }
    },
    current_progress: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: "Текущий прогресс по достижению"
    },
    is_completed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Выполнено ли достижение"
    },
    completion_date: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Дата получения достижения"
    },
    notified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Было ли уведомление о получении достижения"
    },
    bonus_applied: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Был ли применен бонус от этого достижения к профилю пользователя"
    }
  }, {
    timestamps: true,
    underscored: true,
    tableName: 'user_achievements',
    indexes: [
      {
        unique: true,
        fields: ['user_id', 'achievement_id']
      },
      {
        fields: ['user_id', 'is_completed']
      }
    ]
  });

  // Связи
  UserAchievement.associate = (models) => {
    UserAchievement.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    });

    UserAchievement.belongsTo(models.Achievement, {
      foreignKey: 'achievement_id',
      as: 'achievement'
    });
  };

  return UserAchievement;
};
