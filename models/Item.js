'use strict';
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Item = sequelize.define('Item', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: "Название предмета в CS2"
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Описание предмета"
    },
    image_url: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "URL изображения предмета"
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.00,
      comment: "Рыночная стоимость предмета"
    },
    rarity: {
      type: DataTypes.ENUM('common', 'uncommon', 'rare', 'epic', 'legendary', 'mythical'),
      allowNull: false,
      defaultValue: 'common',
      comment: "Редкость предмета"
    },
    drop_weight: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 1.0,
      comment: "Базовый вес выпадения предмета (выше число = чаще выпадает)"
    },
    weapon_type: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Тип оружия (например, Rifle, Pistol, Knife)"
    },
    skin_name: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Название скина"
    },
    category_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'item_categories',
        key: 'id'
      },
      comment: "ID категории предмета"
    },
    steam_market_hash_name: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
      comment: "Хеш-имя предмета на торговой площадке Steam (для вывода)"
    },
    is_available: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: "Доступен ли предмет для выпадения из кейсов"
    },
    min_subscription_tier: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Минимальный уровень подписки для выпадения (0 = любой)"
    },
    // Новые поля для предметов BUFF/CS2:
    float_value: {
      type: DataTypes.FLOAT,
      allowNull: true,
      comment: "Степень износа скина (float value)"
    },
    exterior: {
      type: DataTypes.ENUM('Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle-Scarred'),
      allowNull: true,
      comment: "Состояние скина (exterior)"
    },
    stickers: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: "Список стикеров на предмете"
    },
    quality: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Качество предмета (StatTrak, Souvenir и т.д.)"
    },
    buff_id: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true, // ← ВАЖНО!
      comment: "ID или ссылка на BUFF для автоматизации обновлений"
    },
    origin: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Источник или коллекция предмета"
    }
  }, {
    timestamps: true,
    underscored: true,
    tableName: 'items',
    indexes: [
      { fields: ['rarity'] },
      { fields: ['price'] },
      { fields: ['is_available'] },
      { fields: ['category_id'] },
      { fields: ['weapon_type'] },
      { unique: true, fields: ['buff_id'] } // ← вот это!
    ]
  });

  Item.associate = (models) => {
    Item.hasMany(models.UserInventory, { foreignKey: 'item_id', as: 'inventories' });
    Item.hasMany(models.Case, { foreignKey: 'result_item_id', as: 'dropped_from_cases' });
    Item.hasMany(models.LiveDrop, { foreignKey: 'item_id', as: 'live_drops' });
    Item.belongsTo(models.ItemCategory, { foreignKey: 'category_id', as: 'category' });
  };

  return Item;
};