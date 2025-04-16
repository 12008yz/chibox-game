'use strict';
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const DatabaseMigration = sequelize.define('DatabaseMigration', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      comment: "Имя миграции (обычно имя файла миграции)"
    },
    applied_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      comment: "Дата и время применения миграции"
    },
    version: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: "Версия, к которой относится миграция"
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Описание изменений в миграции"
    },
    is_system: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Является ли системной миграцией"
    },
    applied_by: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "ID пользователя, применившего миграцию"
    },
    rollback_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Дата и время отката миграции (null, если не откатывалась)"
    },
    rollback_by: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "ID пользователя, откатившего миграцию"
    },
    rollback_reason: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Причина отката миграции"
    },
    checksum: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Контрольная сумма файла миграции для обнаружения изменений"
    },
    execution_time: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Время выполнения миграции в миллисекундах"
    },
    is_successful: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: "Успешно ли выполнилась миграция"
    },
    error_message: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Сообщение об ошибке, если миграция не удалась"
    }
  }, {
    timestamps: true,
    underscored: true,
    tableName: 'database_migrations',
    indexes: [
      {
        fields: ['name'],
        unique: true
      },
      {
        fields: ['version']
      },
      {
        fields: ['applied_at']
      },
      {
        fields: ['is_system']
      }
    ]
  });

  // Ассоциации
  DatabaseMigration.associate = (models) => {
    if (models.User) {
      DatabaseMigration.belongsTo(models.User, {
        foreignKey: 'applied_by',
        as: 'applier'
      });

      DatabaseMigration.belongsTo(models.User, {
        foreignKey: 'rollback_by',
        as: 'rollbacker'
      });
    }
  };

  return DatabaseMigration;
};
