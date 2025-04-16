'use strict';
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const UserUnlockableContent = sequelize.define('UserUnlockableContent', {
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
    content_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'unlockable_contents',
        key: 'id'
      },
      comment: "ID разблокируемого контента"
    },
    is_unlocked: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Разблокирован ли контент"
    },
    progress: {
      type: DataTypes.FLOAT,
      defaultValue: 0.0,
      comment: "Прогресс разблокировки от 0 до 1 (0% - 100%)"
    },
    progress_data: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: "Данные о прогрессе в формате JSON"
    },
    unlock_date: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Дата разблокировки контента"
    },
    first_view_date: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Дата первого просмотра разблокированного контента"
    },
    rewards_claimed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Получены ли награды за разблокировку"
    },
    reward_claim_date: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Дата получения наград"
    },
    reward_data: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: "Данные о полученных наградах"
    },
    is_visible: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: "Виден ли контент пользователю (для скрытых квестов)"
    },
    conditions_met_date: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Дата выполнения условий разблокировки"
    },
    source: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Источник разблокировки (система, админ, акция и т.д.)"
    },
    admin_id: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "ID администратора, если контент был разблокирован вручную"
    },
    admin_notes: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Примечания администратора"
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Срок действия разблокировки (null - бессрочно)"
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: "Активен ли контент в данный момент"
    },
    notification_sent: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Было ли отправлено уведомление о разблокировке"
    },
    notification_id: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "ID отправленного уведомления"
    },
    meta_data: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: "Дополнительные метаданные"
    }
  }, {
    timestamps: true,
    underscored: true,
    tableName: 'user_unlockable_contents',
    indexes: [
      {
        fields: ['user_id']
      },
      {
        fields: ['content_id']
      },
      {
        fields: ['is_unlocked']
      },
      {
        fields: ['user_id', 'content_id'],
        unique: true
      },
      {
        fields: ['unlock_date']
      },
      {
        fields: ['expires_at']
      },
      {
        fields: ['is_active']
      },
      {
        fields: ['notification_id']
      }
    ]
  });

  // Ассоциации
  UserUnlockableContent.associate = (models) => {
    UserUnlockableContent.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    });

    UserUnlockableContent.belongsTo(models.UnlockableContent, {
      foreignKey: 'content_id',
      as: 'content'
    });

    if (models.User) {
      UserUnlockableContent.belongsTo(models.User, {
        foreignKey: 'admin_id',
        as: 'admin'
      });
    }

    if (models.Notification) {
      UserUnlockableContent.belongsTo(models.Notification, {
        foreignKey: 'notification_id',
        as: 'notification'
      });
    }
  };

  return UserUnlockableContent;
};
