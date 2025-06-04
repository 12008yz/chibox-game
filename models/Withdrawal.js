'use strict';
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
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
      type: DataTypes.ENUM('pending', 'queued', 'processing', 'waiting_confirmation', 'completed', 'failed', 'cancelled', 'rejected', 'expired', 'direct_trade_pending', 'direct_trade_sent'),
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
    steam_trade_status: {
      type: DataTypes.ENUM('pending', 'sent', 'accepted', 'declined', 'canceled', 'invalid_items', 'invalid_url', 'need_confirmation', 'escrow', 'error'),
      allowNull: true,
      comment: "Статус предложения обмена в Steam"
    },
    steam_partner_id: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Steam ID партнера для обмена"
    },
    steam_escrow_end_date: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Дата окончания периода escrow для обмена (если применимо)"
    },
    admin_id: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "ID администратора, обрабатывающего запрос (если ручная обработка)"
    },
    admin_notes: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Примечания администратора"
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
    last_attempt_date: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Дата последней попытки обработки запроса"
    },
    next_attempt_date: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Дата следующей запланированной попытки обработки"
    },
    is_automatic: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: "Обрабатывается ли запрос автоматически или требует ручной обработки"
    },
    steam_api_response: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: "Ответ API Steam при создании предложения обмена (для отладки)"
    },
    withdrawal_fee: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0.00,
      comment: "Комиссия за вывод предметов (если применяется)"
    },
    priority: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Приоритет обработки (выше число = выше приоритет)"
    },
    user_confirmation_needed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Требуется ли дополнительное подтверждение от пользователя"
    },
    user_confirmation_date: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Дата подтверждения запроса пользователем"
    },
    email_notifications_sent: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Были ли отправлены email-уведомления"
    },
    ip_address: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "IP-адрес, с которого был создан запрос"
    },
    user_agent: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "User-Agent браузера, с которого был создан запрос"
    },
    verification_code: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Код подтверждения (если требуется для дополнительной безопасности)"
    },
    is_verified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Подтвержден ли запрос на вывод через дополнительную верификацию"
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Дата истечения срока действия запроса на вывод"
    },
    tracking_data: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: "Данные отслеживания процесса вывода в формате JSON"
    },
    notification_id: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "ID уведомления, связанного с этим запросом на вывод"
    },
    original_items: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: "Оригинальные данные о предметах на момент создания запроса"
    },
    trade_link_validation: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: "Результаты валидации trade URL"
    },
    cancellation_reason: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Причина отмены запроса (если отменен)"
    },
    cancellation_date: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Дата отмены запроса"
    },
    is_test: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Тестовый запрос (не учитывается в статистике)"
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
      },
      {
        fields: ['steam_trade_offer_id']
      },
      {
        fields: ['priority']
      },
      {
        fields: ['next_attempt_date']
      },
      {
        fields: ['is_automatic']
      },
      {
        fields: ['expires_at']
      },
      {
        fields: ['admin_id']
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

    // Связь с администратором через модель User
    if (models.User) {
      Withdrawal.belongsTo(models.User, {
        foreignKey: 'admin_id',
        as: 'admin'
      });
    }

    // Связь с уведомлениями
    if (models.Notification) {
      Withdrawal.belongsTo(models.Notification, {
        foreignKey: 'notification_id',
        as: 'notification'
      });

      Withdrawal.hasMany(models.Notification, {
        foreignKey: 'related_id',
        scope: {
          category: 'withdrawal'
        },
        as: 'notifications'
      });
    }
  };

  return Withdrawal;
};