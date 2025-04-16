'use strict';
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Notification = sequelize.define('Notification', {
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
      comment: "ID пользователя, которому отправлено уведомление"
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: "Заголовок уведомления"
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
      comment: "Текст уведомления"
    },
    type: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'info',
      validate: {
        isIn: [['info', 'success', 'warning', 'error', 'system']]
      },
      comment: "Тип уведомления (info, success, warning, error, system)"
    },
    category: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isIn: [['general', 'case_opening', 'transaction', 'achievement', 'promotion', 'subscription', 'withdrawal', 'bonus', 'level_up']]
      },
      comment: "Категория уведомления"
    },
    link: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "URL-ссылка для действия (если есть)"
    },
    is_read: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Прочитано ли уведомление пользователем"
    },
    read_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Когда было прочитано уведомление"
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Дата истечения уведомления (null - бессрочно)"
    },
    importance: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      validate: {
        min: 0,
        max: 10
      },
      comment: "Важность уведомления (0-10), влияет на сортировку"
    },
    data: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: "Дополнительные данные в формате JSON"
    }
  }, {
    timestamps: true, // Создаст createdAt и updatedAt
    underscored: true, // Использует snake_case для полей в БД
    tableName: 'notifications',
    indexes: [
      {
        fields: ['user_id']
      },
      {
        fields: ['type']
      },
      {
        fields: ['category']
      },
      {
        fields: ['is_read']
      },
      {
        fields: ['expires_at']
      },
      {
        fields: ['importance']
      },
      {
        fields: ['created_at']
      }
    ]
  });

  // Ассоциации
  Notification.associate = (models) => {
    Notification.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    });
  };

  return Notification;
};
