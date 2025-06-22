'use strict';

module.exports = {
  up: async (queryInterface, DataTypes) => {
    await queryInterface.createTable('items', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      image_url: {
        type: DataTypes.STRING,
        allowNull: true
      },
      price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.00
      },
      rarity: {
        type: DataTypes.ENUM('common', 'uncommon', 'rare', 'epic', 'legendary', 'mythical'),
        allowNull: false,
        defaultValue: 'common'
      },
      drop_weight: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 1.0
      },
      weapon_type: {
        type: DataTypes.STRING,
        allowNull: true
      },
      skin_name: {
        type: DataTypes.STRING,
        allowNull: true
      },
      category_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'item_categories', key: 'id' }
      },
      steam_market_hash_name: {
        type: DataTypes.STRING,
        allowNull: true
      },
      is_available: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
      },
      min_subscription_tier: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },
      // Новые поля:
      float_value: {
        type: DataTypes.FLOAT,
        allowNull: true
      },
      exterior: {
        type: DataTypes.ENUM('Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle-Scarred'),
        allowNull: true
      },
      stickers: {
        type: DataTypes.JSON,
        allowNull: true
      },
      quality: {
        type: DataTypes.STRING,
        allowNull: true
      },
      origin: {
        type: DataTypes.STRING,
        allowNull: true
      },
      created_at: {
        allowNull: false,
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
      },
      updated_at: {
        allowNull: false,
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
      }
    });
    await queryInterface.addIndex('items', ['rarity']);
    await queryInterface.addIndex('items', ['price']);
    await queryInterface.addIndex('items', ['is_available']);
    await queryInterface.addIndex('items', ['category_id']);
    await queryInterface.addIndex('items', ['weapon_type']);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('items');
  }
};