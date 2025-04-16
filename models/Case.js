'use strict';
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Case = sequelize.define('Case', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'Ежедневный кейс'
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    image_url: {
      type: DataTypes.STRING,
      allowNull: true
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      },
      comment: "ID пользователя, владеющего этим кейсом"
    },
    is_opened: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Открыт ли этот кейс"
    },
    received_date: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      comment: "Дата получения кейса пользователем"
    },
    opened_date: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Дата открытия кейса"
    },
    result_item_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'items',
        key: 'id'
      },
      comment: "ID предмета, который выпал из кейса (если кейс открыт)"
    },
    subscription_tier: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
      comment: "Уровень подписки, при котором был получен кейс"
    },
    drop_bonus_applied: {
      type: DataTypes.FLOAT,
      defaultValue: 0.0,
      comment: "Какой бонус к выпадению был применен при открытии кейса"
    }
  }, {
    timestamps: true,
    underscored: true,
    tableName: 'cases',
    indexes: [
      {
        fields: ['user_id']
      },
      {
        fields: ['is_opened']
      },
      {
        fields: ['user_id', 'is_opened']
      },
      {
        fields: ['result_item_id']
      }
    ]
  });

  // Ассоциации
  Case.associate = (models) => {
    Case.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    });

    Case.belongsTo(models.Item, {
      foreignKey: 'result_item_id',
      as: 'result_item'
    });

    Case.hasMany(models.LiveDrop, {
      foreignKey: 'case_id',
      as: 'live_drops'
    });

    Case.hasOne(models.UserInventory, {
      foreignKey: 'case_id',
      as: 'inventory_item'
    });
  };

  return Case;
};
