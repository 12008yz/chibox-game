'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Streamer = sequelize.define('Streamer', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    },
    balance: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0,
      allowNull: false
    },
    percent_from_deposit: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 10,
      allowNull: false
    },
    fixed_registration: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
      allowNull: false
    },
    fixed_first_deposit: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
      allowNull: false
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      allowNull: false
    }
  }, {
    timestamps: true,
    underscored: true,
    tableName: 'streamers'
  });

  Streamer.associate = (models) => {
    Streamer.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    Streamer.hasMany(models.ReferralLink, { foreignKey: 'streamer_id', as: 'referralLinks' });
    Streamer.hasMany(models.StreamerEarning, { foreignKey: 'streamer_id', as: 'earnings' });
    Streamer.hasMany(models.StreamerPayout, { foreignKey: 'streamer_id', as: 'payouts' });
    Streamer.hasMany(models.StreamerMaterial, { foreignKey: 'streamer_id', as: 'materials' });
    Streamer.hasMany(models.PromoCode, { foreignKey: 'streamer_id', as: 'promoCodes' });
  };

  return Streamer;
};
