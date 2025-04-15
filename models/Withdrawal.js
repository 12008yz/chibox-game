'use strict';

module.exports = (sequelize, DataTypes) => {
  const Withdrawal = sequelize.define('Withdrawal', {
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
      comment: "ID пользователя, запросившего вывод предметов"
    },
    status: {
      type: DataTypes.ENUM('pending', 'processing', 'completed', 'failed', 'cancelled'),
      defaultValue: 'pending',
      comment: "Статус запроса на вывод предметов"
    },
    request_date: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      comment: "Дата создания запроса на вывод"
    },
    processing_date: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Дата начала обработки запроса"
    },
    completion_date: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Дата завершения запроса (успешного или нет)"
    },
    steam_trade_url: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: "URL для обмена Steam, использованный в этом запросе"
    },
    steam_trade_offer_id: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "ID предложения обмена в Steam (если было создано)"
    },
    admin_id: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "ID администратора, обрабатывающего запрос (если ручная обработка)"
    },
    total_items_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Общее количество предметов в запросе на вывод"
    },
    total_items_value: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0.00,
      comment: "Общая стоимость предметов в запросе"
    },
    failed_reason: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Причина отказа/неудачи при выводе предметов"
    },
    processing_attempts: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Количество попыток обработки запроса"
    },
    is_automatic: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: "Обрабатывается ли запрос автоматически или требует ручной обработки"
    },
    steam_api_response: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Ответ API Steam при создании предложения обмена (для отладки)"
    },
    withdrawal_fee: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0.00,
      comment: "Комиссия за вывод предметов (если применяется)"
    }
  }, {
    timestamps: true,
    underscored: true,
    tableName: 'withdrawals',
    indexes: [
      {
        fields: ['user_id']
      },
      {
        fields: ['status']
      },
      {
        fields: ['user_id', 'status']
      },
      {
        fields: ['request_date']
      },
      {
        fields: ['completion_date']
      }
    ]
  });

  // Ассоциации
  Withdrawal.associate = (models) => {
    Withdrawal.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    });

    Withdrawal.hasMany(models.UserInventory, {
      foreignKey: 'withdrawal_id',
      as: 'items'
    });

    // Необязательно, если у вас есть модель Admin
    // Withdrawal.belongsTo(models.Admin, {
    //   foreignKey: 'admin_id',
    //   as: 'admin'
    // });
  };

  return Withdrawal;
};
