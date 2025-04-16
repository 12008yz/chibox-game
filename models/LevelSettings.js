'use strict';
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const LevelSettings = sequelize.define('LevelSettings', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    level: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
      comment: "Номер уровня"
    },
    xp_required: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "Общее количество XP, необходимое для достижения этого уровня"
    },
    xp_to_next_level: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "Количество XP для перехода с этого уровня на следующий"
    },
    bonus_percentage: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0.0,
      comment: "Бонус к дропу предметов на этом уровне (в процентах)"
    },
    daily_cases_bonus: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Бонусное количество ежедневных кейсов на этом уровне"
    },
    icon_url: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "URL иконки уровня"
    },
    color_code: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Цветовой код для отображения уровня (HEX)"
    },
    special_perks: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: "Специальные бонусы для этого уровня (в формате JSON)"
    },
    reward_description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Описание наград за достижение этого уровня"
    },
    is_milestone: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Является ли уровень особым с дополнительными наградами"
    }
  }, {
    timestamps: true,
    underscored: true,
    tableName: 'level_settings',
    indexes: [
      {
        fields: ['level'],
        unique: true
      }
    ]
  });

  LevelSettings.associate = (models) => {
    // Пока нет прямых ассоциаций
  };

  return LevelSettings;
};
