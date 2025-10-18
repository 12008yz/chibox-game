'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDescription = await queryInterface.describeTable('users');

    if (!tableDescription.steam_id) {
      await queryInterface.addColumn('users', 'steam_id', {
        type: Sequelize.STRING,
        allowNull: true,
        unique: true,
        comment: 'Steam ID пользователя для OAuth авторизации'
      });
    }

    if (!tableDescription.steam_profile) {
      await queryInterface.addColumn('users', 'steam_profile', {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Данные профиля Steam (аватар, никнейм и т.д.)'
      });
    }

    if (!tableDescription.steam_avatar) {
      await queryInterface.addColumn('users', 'steam_avatar', {
        type: Sequelize.STRING,
        allowNull: true,
        comment: 'URL аватара Steam'
      });
    }

    if (!tableDescription.steam_profile_url) {
      await queryInterface.addColumn('users', 'steam_profile_url', {
        type: Sequelize.STRING,
        allowNull: true,
        comment: 'URL профиля Steam'
      });
    }

    if (!tableDescription.steam_trade_url) {
      await queryInterface.addColumn('users', 'steam_trade_url', {
        type: Sequelize.STRING,
        allowNull: true,
        comment: 'URL для обмена Steam (нужен для вывода предметов)'
      });
    }

    if (!tableDescription.auth_provider) {
      await queryInterface.addColumn('users', 'auth_provider', {
        type: Sequelize.ENUM('local', 'steam'),
        defaultValue: 'local',
        allowNull: false,
        comment: 'Провайдер авторизации (local для обычной регистрации, steam для Steam OAuth)'
      });
    }

    // Добавляем индекс для steam_id
    try {
      await queryInterface.addIndex('users', ['steam_id'], {
        name: 'users_steam_id_idx',
        unique: true
      });
    } catch (e) {
      // Индекс уже существует
    }
  },

  async down(queryInterface, Sequelize) {
    const tableDescription = await queryInterface.describeTable('users');

    try {
      await queryInterface.removeIndex('users', 'users_steam_id_idx');
    } catch (e) {}

    if (tableDescription.steam_id) {
      await queryInterface.removeColumn('users', 'steam_id');
    }

    if (tableDescription.steam_profile) {
      await queryInterface.removeColumn('users', 'steam_profile');
    }

    if (tableDescription.steam_avatar) {
      await queryInterface.removeColumn('users', 'steam_avatar');
    }

    if (tableDescription.steam_profile_url) {
      await queryInterface.removeColumn('users', 'steam_profile_url');
    }

    if (tableDescription.steam_trade_url) {
      await queryInterface.removeColumn('users', 'steam_trade_url');
    }

    if (tableDescription.auth_provider) {
      await queryInterface.removeColumn('users', 'auth_provider');
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_users_auth_provider";');
    }
  }
};
