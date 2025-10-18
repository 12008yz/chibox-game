'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDescription = await queryInterface.describeTable('users');

    // Добавляем steam_profile
    if (!tableDescription.steam_profile) {
      await queryInterface.addColumn('users', 'steam_profile', {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Данные профиля Steam (аватар, никнейм и т.д.)'
      });
      console.log('✅ Поле steam_profile добавлено');
    }

    // Создаем ENUM тип для auth_provider
    if (!tableDescription.auth_provider) {
      try {
        await queryInterface.sequelize.query("CREATE TYPE \"enum_users_auth_provider\" AS ENUM('local', 'steam')");
        console.log('✅ ENUM тип enum_users_auth_provider создан');
      } catch (error) {
        console.log('ℹ️ ENUM тип enum_users_auth_provider уже существует');
      }

      await queryInterface.addColumn('users', 'auth_provider', {
        type: Sequelize.ENUM('local', 'steam'),
        defaultValue: 'local',
        allowNull: false,
        comment: 'Провайдер авторизации (local для обычной регистрации, steam для Steam OAuth)'
      });
      console.log('✅ Поле auth_provider добавлено');
    }
  },

  async down(queryInterface, Sequelize) {
    const tableDescription = await queryInterface.describeTable('users');

    if (tableDescription.steam_profile) {
      await queryInterface.removeColumn('users', 'steam_profile');
    }

    if (tableDescription.auth_provider) {
      await queryInterface.removeColumn('users', 'auth_provider');
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_users_auth_provider";');
    }
  }
};
