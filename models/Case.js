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
    template_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'case_templates',
        key: 'id'
      },
      comment: "ID шаблона кейса, если кейс создан на основе шаблона"
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
    },
    is_paid: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Был ли кейс куплен за деньги"
    },
    purchase_price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: "Цена покупки кейса, если он был куплен"
    },
    source: {
      type: DataTypes.ENUM('subscription', 'purchase', 'achievement', 'gift', 'event', 'mission'),
      defaultValue: 'subscription',
      comment: "Источник получения кейса"
    },
    related_achievement_id: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "ID связанного достижения, если кейс получен через достижение"
    },
    related_mission_id: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "ID связанной миссии, если кейс получен через миссию"
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Срок действия кейса (null - бессрочно)"
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
        fields: ['template_id']
      },
      {
        fields: ['user_id', 'is_opened']
      },
      {
        fields: ['result_item_id']
      },
      {
        fields: ['expires_at']
      },
      {
        fields: ['source']
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

    Case.belongsTo(models.CaseTemplate, {
      foreignKey: 'template_id',
      as: 'template'
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
