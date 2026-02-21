'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ReferralLink = sequelize.define('ReferralLink', {
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
    code: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true
    },
    label: {
      type: DataTypes.STRING(128),
      allowNull: true
    },
    clicks_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false
    },
    registrations_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false
    },
    first_deposits_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false
    }
  }, {
    timestamps: true,
    underscored: true,
    tableName: 'referral_links'
  });

  ReferralLink.associate = (models) => {
    ReferralLink.belongsTo(models.Streamer, { foreignKey: 'streamer_id', as: 'streamer' });
    ReferralLink.hasMany(models.StreamerEarning, { foreignKey: 'referral_link_id', as: 'earnings' });
    ReferralLink.hasMany(models.User, { foreignKey: 'referred_by_link_id', as: 'referredUsers' });
  };

  return ReferralLink;
};
