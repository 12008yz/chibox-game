'use strict';
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const CaseItemDrop = sequelize.define('CaseItemDrop', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: "ID пользователя, который получил предмет"
    },
    case_template_id: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: "ID шаблона кейса, из которого выпал предмет"
    },
    item_id: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: "ID предмета, который выпал"
    },
    dropped_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: "Время выпадения предмета"
    },
    case_id: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "ID конкретного кейса, если доступен"
    }
  }, {
    timestamps: true,
    underscored: true,
    tableName: 'case_item_drops',
    indexes: [
      {
        fields: ['user_id']
      },
      {
        fields: ['case_template_id']
      },
      {
        fields: ['item_id']
      },
      {
        fields: ['user_id', 'case_template_id']
      },
      {
        unique: true,
        fields: ['user_id', 'case_template_id', 'item_id'],
        name: 'unique_user_case_item_drop'
      }
    ]
  });

  // Ассоциации
  CaseItemDrop.associate = (models) => {
    CaseItemDrop.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    });

    CaseItemDrop.belongsTo(models.CaseTemplate, {
      foreignKey: 'case_template_id',
      as: 'case_template'
    });

    CaseItemDrop.belongsTo(models.Item, {
      foreignKey: 'item_id',
      as: 'item'
    });

    CaseItemDrop.belongsTo(models.Case, {
      foreignKey: 'case_id',
      as: 'case'
    });
  };

  return CaseItemDrop;
};
