'use strict';
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const XpTransaction = sequelize.define('XpTransaction', {
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
      comment: "ID пользователя, получившего XP"
    },
    amount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "Количество полученных XP"
    },
    source_type: {
      type: DataTypes.ENUM(
        'case_open',         // Открытие кейса (старое название)
        'case_opening',      // Открытие кейса
        'achievement',       // Выполнение достижения
        'daily_login',       // Ежедневный вход
        'battle_win',        // Победа в битве
        'purchase',          // Покупка (пополнение баланса, подписка)
        'buy_case',          // Покупка кейса
        'buy_subscription',  // Покупка подписки
        'sell_item',         // Продажа предмета
        'upgrade_success',   // Успешный апгрейд
        'upgrade_fail',      // Неудачный апгрейд
        'withdraw_item',     // Вывод предмета
        'deposit',           // Пополнение баланса
        'referral',          // Реферальная программа
        'admin',             // Начисление администратором
        'event',             // Участие в событии
        'other'              // Другое
      ),
      allowNull: false,
      comment: "Источник получения XP"
    },
    source_id: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "ID источника (например, ID достижения, если source_type='achievement')"
    },
    description: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Описание операции начисления XP"
    },
    is_level_up: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Привело ли это начисление к повышению уровня"
    },
    new_level: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Новый уровень пользователя, если произошло повышение"
    }
  }, {
    timestamps: true,
    underscored: true,
    tableName: 'xp_transactions',
    indexes: [
      {
        fields: ['user_id']
      },
      {
        fields: ['created_at']
      },
      {
        fields: ['source_type']
      },
      {
        fields: ['source_id']
      }
    ]
  });

  // Ассоциации
  XpTransaction.associate = (models) => {
    XpTransaction.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    });
  };

  return XpTransaction;
};
