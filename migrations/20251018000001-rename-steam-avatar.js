'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDescription = await queryInterface.describeTable('users');

    // Если существует steam_avatar, переименовываем его в steam_avatar_url
    if (tableDescription.steam_avatar && !tableDescription.steam_avatar_url) {
      await queryInterface.renameColumn('users', 'steam_avatar', 'steam_avatar_url');
      console.log('✅ Поле steam_avatar переименовано в steam_avatar_url');
    } else if (!tableDescription.steam_avatar_url) {
      // Если вообще нет поля, создаем steam_avatar_url
      await queryInterface.addColumn('users', 'steam_avatar_url', {
        type: Sequelize.STRING,
        allowNull: true,
        comment: 'URL аватара Steam'
      });
      console.log('✅ Поле steam_avatar_url создано');
    } else {
      console.log('ℹ️ Поле steam_avatar_url уже существует');
    }
  },

  async down(queryInterface, Sequelize) {
    const tableDescription = await queryInterface.describeTable('users');

    if (tableDescription.steam_avatar_url) {
      await queryInterface.renameColumn('users', 'steam_avatar_url', 'steam_avatar');
    }
  }
};
