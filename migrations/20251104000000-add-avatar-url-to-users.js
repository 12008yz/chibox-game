'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('users', 'avatar_url', {
      type: Sequelize.STRING(500),
      allowNull: true,
      comment: 'URL пользовательского аватара'
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('users', 'avatar_url');
  }
};
