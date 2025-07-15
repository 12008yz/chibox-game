'use strict';
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const UserInventory = sequelize.define('UserInventory', {
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
      comment: "ID пользователя, владеющего предметом"
    },
    item_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'items',
        key: 'id'
      },
      comment: "ID предмета в инвентаре"
    },
    acquisition_date: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      comment: "Дата получения предмета"
    },
    source: {
      type: DataTypes.ENUM('case', 'bonus', 'achievement', 'purchase', 'system'),
      allowNull: false,
      defaultValue: 'case',
      comment: "Источник получения предмета"
    },
    status: {
      type: DataTypes.ENUM('inventory', 'sold', 'converted_to_subscription', 'withdrawn', 'used'),
      defaultValue: 'inventory',
      comment: "Статус предмета: в инвентаре, продан, конвертирован в подписку, выведен в Steam, использован"
    },
    transaction_date: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Дата продажи/конвертации/вывода предмета"
    },
    case_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'cases',
        key: 'id'
      },
      comment: "ID кейса, из которого был получен предмет (если source = 'case')"
    },
    item_type: {
      type: DataTypes.ENUM('item', 'case'),
      allowNull: false,
      defaultValue: 'item',
      comment: "Тип предмета: обычный предмет или кейс"
    },
    case_template_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'case_templates',
        key: 'id'
      },
      comment: "ID шаблона кейса, если это кейс в инвентаре"
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Дата истечения срока действия кейса/предмета"
    },
    transaction_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'transactions',
        key: 'id'
      },
      comment: "ID транзакции, связанной с этим предметом (при продаже или конвертации)"
    },
    withdrawal_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'withdrawals',
        key: 'id'
      },
      comment: "ID запроса на вывод этого предмета (если был запрос)"
    }
  }, {
    timestamps: true,
    underscored: true,
    tableName: 'user_inventory',
    indexes: [
      {
        fields: ['user_id']
      },
      {
        fields: ['item_id']
      },
      {
        fields: ['status']
      },
      {
        fields: ['user_id', 'status']
      },
      {
        fields: ['case_id']
      },
      {
        fields: ['transaction_id']
      },
      {
        fields: ['item_type']
      },
      {
        fields: ['case_template_id']
      },
      {
        fields: ['user_id', 'item_type']
      }
    ]
  });

  // Ассоциации
  UserInventory.associate = (models) => {
    UserInventory.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    });

    UserInventory.belongsTo(models.Item, {
      foreignKey: 'item_id',
      as: 'item'
    });

    UserInventory.belongsTo(models.Case, {
      foreignKey: 'case_id',
      as: 'case'
    });

    UserInventory.belongsTo(models.Transaction, {
      foreignKey: 'transaction_id',
      as: 'transaction'
    });

    UserInventory.belongsTo(models.Withdrawal, {
      foreignKey: 'withdrawal_id',
      as: 'withdrawal'
    });

    UserInventory.belongsTo(models.CaseTemplate, {
      foreignKey: 'case_template_id',
      as: 'case_template'
    });
  };

  return UserInventory;
};
