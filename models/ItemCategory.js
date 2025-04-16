'use strict';
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ItemCategory = sequelize.define('ItemCategory', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      comment: "Название категории предметов"
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Описание категории"
    },
    icon_url: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "URL иконки категории"
    },
    display_order: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Порядок отображения в списке категорий"
    },
    color_code: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Цветовой код для отображения категории (HEX)"
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: "Активна ли категория"
    }
  }, {
    timestamps: true,
    underscored: true,
    tableName: 'item_categories',
    indexes: [
      {
        fields: ['name'],
        unique: true
      },
      {
        fields: ['is_active']
      },
      {
        fields: ['display_order']
      }
    ]
  });

  // Ассоциации
  ItemCategory.associate = (models) => {
    ItemCategory.hasMany(models.Item, {
      foreignKey: 'category_id',
      as: 'items'
    });
  };

  return ItemCategory;
};
