'use strict';
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const GlobalChatMessage = sequelize.define(
    'GlobalChatMessage',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
      },
      body: {
        type: DataTypes.STRING(500),
        allowNull: false,
      },
    },
    {
      timestamps: true,
      underscored: true,
      tableName: 'global_chat_messages',
      indexes: [{ fields: ['created_at'] }, { fields: ['user_id'] }],
    }
  );

  GlobalChatMessage.associate = (models) => {
    GlobalChatMessage.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'author',
    });
  };

  return GlobalChatMessage;
};
