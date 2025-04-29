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
    buff_id: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
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
