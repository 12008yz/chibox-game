'use strict';
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const UserStar = sequelize.define(
    'UserStar',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      starred_user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
      },
      stargazer_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
      },
    },
    {
      timestamps: true,
      underscored: true,
      tableName: 'user_stars',
      indexes: [
        {
          unique: true,
          fields: ['stargazer_id', 'starred_user_id'],
        },
        {
          fields: ['starred_user_id'],
        },
      ],
    }
  );

  UserStar.associate = (models) => {
    UserStar.belongsTo(models.User, {
      foreignKey: 'starred_user_id',
      as: 'starredUser',
    });
    UserStar.belongsTo(models.User, {
      foreignKey: 'stargazer_id',
      as: 'stargazer',
    });
  };

  return UserStar;
};
