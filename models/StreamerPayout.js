'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const StreamerPayout = sequelize.define('StreamerPayout', {
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
    amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false
    },
    method: {
      type: DataTypes.ENUM('balance', 'card', 'steam', 'other'),
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('pending', 'completed', 'cancelled'),
      defaultValue: 'pending',
      allowNull: false
    },
    details: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    processed_at: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    timestamps: true,
    underscored: true,
    tableName: 'streamer_payouts'
  });

  StreamerPayout.associate = (models) => {
    StreamerPayout.belongsTo(models.Streamer, { foreignKey: 'streamer_id', as: 'streamer' });
  };

  return StreamerPayout;
};
