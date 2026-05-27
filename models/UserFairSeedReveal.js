'use strict';
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const UserFairSeedReveal = sequelize.define(
    'UserFairSeedReveal',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      server_seed: {
        type: DataTypes.STRING(128),
        allowNull: false
      },
      server_seed_hash: {
        type: DataTypes.STRING(64),
        allowNull: false
      },
      nonce_from: {
        type: DataTypes.BIGINT,
        allowNull: false
      },
      nonce_to: {
        type: DataTypes.BIGINT,
        allowNull: false
      },
      revealed_at: {
        type: DataTypes.DATE,
        allowNull: false
      }
    },
    {
      tableName: 'user_fair_seed_reveals',
      underscored: true,
      timestamps: true
    }
  );

  UserFairSeedReveal.associate = (models) => {
    UserFairSeedReveal.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
  };

  return UserFairSeedReveal;
};
