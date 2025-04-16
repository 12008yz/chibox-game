'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const LiveDrop = sequelize.define('LiveDrop', {
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
      comment: "ID пользователя, получившего предмет"
    },
    item_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'items',
        key: 'id'
      },
      comment: "ID выпавшего предмета"
    },
    case_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'cases',
        key: 'id'
      },
      comment: "ID кейса, из которого выпал предмет"
    },
    drop_time: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      comment: "Время выпадения предмета"
    },
    is_rare_item: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Является ли предмет редким (для выделения в интерфейсе)"
    },
    item_price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: "Цена предмета на момент выпадения (для быстрого доступа без JOIN)"
    },
    item_rarity: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Редкость предмета на момент выпадения (для быстрого доступа без JOIN)"
    },
    user_level: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Уровень пользователя на момент выпадения"
    },
    user_subscription_tier: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Уровень подписки пользователя на момент выпадения"
    },
    is_highlighted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Выделять ли это выпадение в интерфейсе (например, очень дорогие предметы)"
    },
    is_hidden: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Скрывать ли это выпадение из ленты (для модерации)"
    }
  }, {
    timestamps: true,
    underscored: true,
    tableName: 'live_drops',
    indexes: [
      {
        fields: ['drop_time']
      },
      {
        fields: ['user_id']
      },
      {
        fields: ['item_id']
      },
      {
        fields: ['is_rare_item']
      },
      {
        fields: ['is_hidden']
      },
      {
        fields: ['item_price']
      }
    ]
  });

  // Ассоциации
  LiveDrop.associate = (models) => {
    LiveDrop.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    });
    
    LiveDrop.belongsTo(models.Item, {
      foreignKey: 'item_id',
      as: 'item'
    });
    
    LiveDrop.belongsTo(models.Case, {
      foreignKey: 'case_id',
      as: 'case'
    });
  };

  return LiveDrop;
};