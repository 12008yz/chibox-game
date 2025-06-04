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
      type: DataTypes.STRING(1024),
      allowNull: false,
      comment: "Название предмета в CS2"
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Описание предмета в формате JSON"
    },
    image_url: {
      type: DataTypes.STRING(1024),
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
      type: DataTypes.ENUM(
        'consumer',
        'industrial',
        'milspec',
        'restricted',
        'classified',
        'covert',
        'contraband',
        'exotic'
      ),
      allowNull: false,
      defaultValue: 'consumer',
      comment: 'Раритетность предмета как в CS2'
    },
    drop_weight: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 1,
      comment: "Вес выпадения предмета"
    },
    min_subscription_tier: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
      comment: "Минимальный уровень подписки для доступа"
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
    quality: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Качество предмета (StatTrak, Souvenir и т.д.)"
    },
    stickers: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: "Стикеры на предмете"
    },
    origin: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Источник или коллекция предмета"
    },
    in_stock: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: "Находится ли предмет на складе (Steam боте/аккаунте для выдачи)"
    },
    is_tradable: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: "Можно ли сейчас передать предмет в трейде (учёт блокировки Steam)"
    },
    asset_id: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "ID ассета на CS.Money"
    },
  }, {
    timestamps: true,
    underscored: true,
    tableName: 'items',
    indexes: [
      { fields: ['rarity'] },
      { fields: ['price'] },
      { fields: ['is_available'] },
      { fields: ['weapon_type'] },
      { unique: true, fields: ['buff_id'] }
    ]
  });

  Item.associate = (models) => {
    Item.hasMany(models.UserInventory, { foreignKey: 'item_id', as: 'inventories' });
    Item.hasMany(models.Case, { foreignKey: 'result_item_id', as: 'dropped_from_cases' });
    Item.hasMany(models.LiveDrop, { foreignKey: 'item_id', as: 'live_drops' });
    Item.belongsTo(models.ItemCategory, { foreignKey: 'category_id', as: 'category' });
    Item.belongsToMany(models.CaseTemplate, {
      through: 'case_template_items',
      foreignKey: 'item_id',
      otherKey: 'case_template_id',
      as: 'case_templates'
    });
  };

  return Item;
};
