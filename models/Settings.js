'use strict';
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Settings = sequelize.define('Settings', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    key: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      comment: "Ключ настройки"
    },
    value: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Значение настройки"
    },
    type: {
      type: DataTypes.ENUM('string', 'number', 'boolean', 'json', 'array'),
      defaultValue: 'string',
      comment: "Тип значения настройки"
    },
    category: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'general',
      comment: "Категория настройки (general, drop_rates, payments, etc.)"
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Описание настройки"
    },
    is_public: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Доступна ли настройка клиентам"
    },
    requires_restart: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Требует ли изменение настройки перезапуска сервера"
    },
    default_value: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Значение по умолчанию"
    },
    validation_rules: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: "Правила валидации в формате JSON"
    },
    modified_by: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "ID пользователя, последним изменившим настройку"
    }
  }, {
    timestamps: true,
    underscored: true,
    tableName: 'settings',
    indexes: [
      {
        fields: ['key'],
        unique: true
      },
      {
        fields: ['category']
      },
      {
        fields: ['is_public']
      }
    ]
  });

  // Ассоциации могут быть необязательны для настроек
  Settings.associate = (models) => {
    if (models.User) {
      Settings.belongsTo(models.User, {
        foreignKey: 'modified_by',
        as: 'modifier'
      });
    }
  };

  return Settings;
};
