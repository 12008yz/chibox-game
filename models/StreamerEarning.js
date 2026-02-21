'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const StreamerEarning = sequelize.define('StreamerEarning', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    streamer_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'streamers', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    },
    type: {
      type: DataTypes.ENUM('registration', 'first_deposit', 'deposit_percent'),
      allowNull: false
    },
    amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false
    },
    referral_link_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'referral_links', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    },
    referred_user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    },
    payment_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'payments', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    }
  }, {
    timestamps: true,
    createdAt: true,
    updatedAt: false,
    underscored: true,
    tableName: 'streamer_earnings'
  });

  StreamerEarning.associate = (models) => {
    StreamerEarning.belongsTo(models.Streamer, { foreignKey: 'streamer_id', as: 'streamer' });
    StreamerEarning.belongsTo(models.ReferralLink, { foreignKey: 'referral_link_id', as: 'referralLink' });
    StreamerEarning.belongsTo(models.User, { foreignKey: 'referred_user_id', as: 'referredUser' });
    StreamerEarning.belongsTo(models.Payment, { foreignKey: 'payment_id', as: 'payment' });
  };

  return StreamerEarning;
};
