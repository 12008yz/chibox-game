'use strict';
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const BonusMiniGameHistory = sequelize.define('BonusMiniGameHistory', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' }
    },
    played_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: 'Дата и время прохождения мини-игры'
    },
    game_grid: {
      type: DataTypes.TEXT,
      allowNull: false,
      comment: 'Структура сетки/квадратов/выигрышных клеток (JSON)'
    },
    chosen_cells: {
      type: DataTypes.TEXT,
      allowNull: false,
      comment: 'Какие клетки выбрал пользователь (JSON)'
    },
    won: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      comment: 'Выиграл или нет (есть приз)'
    },
    prize_type: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Тип приза: item, balance, xp, sub_days, none'
    },
    prize_value: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Значение приза (id/сумма/xp/дней), если не выиграл — null'
    }
  }, {
    timestamps: false,
    underscored: true,
    tableName: 'bonus_minigame_histories'
  });

  BonusMiniGameHistory.associate = (models) => {
    BonusMiniGameHistory.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
  };

  return BonusMiniGameHistory;
};
