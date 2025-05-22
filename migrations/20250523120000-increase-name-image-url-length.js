'use strict';

module.exports = {
  up: async (queryInterface, DataTypes) => {
    await queryInterface.changeColumn('items', 'name', {
      type: DataTypes.STRING(1024),
      allowNull: false,
    });
    await queryInterface.changeColumn('items', 'image_url', {
      type: DataTypes.STRING(1024),
      allowNull: true,
    });
  },

  down: async (queryInterface, DataTypes) => {
    await queryInterface.changeColumn('items', 'name', {
      type: DataTypes.STRING(255),
      allowNull: false,
    });
    await queryInterface.changeColumn('items', 'image_url', {
      type: DataTypes.STRING(255),
      allowNull: true,
    });
  }
};
