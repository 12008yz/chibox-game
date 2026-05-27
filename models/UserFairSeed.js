'use strict';
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const UserFairSeed = sequelize.define(
    'UserFairSeed',
    {
      user_id: {
        type: DataTypes.UUID,
        primaryKey: true
      },
      server_seed: {
        type: DataTypes.STRING(128),
        allowNull: false
      },
      server_seed_hash: {
        type: DataTypes.STRING(64),
        allowNull: false
      },
      client_seed: {
        type: DataTypes.STRING(64),
        allowNull: false
      },
      next_nonce: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0
      }
    },
    {
      tableName: 'user_fair_seeds',
      underscored: true,
      timestamps: true
    }
  );

  UserFairSeed.associate = (models) => {
    UserFairSeed.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
  };

  return UserFairSeed;
};
