'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const StreamerMaterial = sequelize.define('StreamerMaterial', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    streamer_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'streamers', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    },
    type: {
      type: DataTypes.ENUM('banner', 'text'),
      allowNull: false
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    url: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    sort_order: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false
    }
  }, {
    timestamps: true,
    underscored: true,
    tableName: 'streamer_materials'
  });

  StreamerMaterial.associate = (models) => {
    StreamerMaterial.belongsTo(models.Streamer, { foreignKey: 'streamer_id', as: 'streamer' });
  };

  return StreamerMaterial;
};
