'use strict';
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Cache = sequelize.define('Cache', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    key: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      comment: "Ключ кэша"
    },
    value: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
      comment: "Значение кэша в строковом формате (обычно JSON)"
    },
    type: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'general',
      comment: "Тип кэшированных данных"
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Срок действия кэша (null - бессрочно)"
    },
    is_compressed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Сжаты ли данные"
    },
    tags: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: [],
      comment: "Теги для группировки и инвалидации кэша"
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: "Метаданные о кэше"
    },
    created_by: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "ID пользователя, создавшего кэш (null для системных кэшей)"
    },
    is_system: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Является ли кэш системным"
    },
    last_accessed: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Время последнего доступа к кэшу"
    },
    access_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Количество обращений к кэшу"
    },
    size_bytes: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Размер кэшированных данных в байтах"
    }
  }, {
    timestamps: true,
    underscored: true,
    tableName: 'caches',
    indexes: [
      {
        fields: ['key'],
        unique: true
      },
      {
        fields: ['type']
      },
      {
        fields: ['expires_at']
      },
      {
        fields: ['is_system']
      },
      {
        fields: ['tags'],
        using: 'gin'
      },
      {
        fields: ['last_accessed']
      }
    ]
  });

  // Ассоциации
  Cache.associate = (models) => {
    if (models.User) {
      Cache.belongsTo(models.User, {
        foreignKey: 'created_by',
        as: 'creator'
      });
    }
  };

  return Cache;
};
