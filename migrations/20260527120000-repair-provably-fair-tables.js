'use strict';

/**
 * Восстанавливает user_fair_seeds / user_fair_seed_reveals, если миграция
 * 20260327120000 была отмечена в SequelizeMeta, но таблицы не созданы.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const [existing] = await queryInterface.sequelize.query(
      `SELECT tablename FROM pg_tables
       WHERE schemaname = 'public' AND tablename = 'user_fair_seeds'`
    );
    if (existing.length > 0) {
      return;
    }

    await queryInterface.createTable('user_fair_seeds', {
      user_id: {
        type: Sequelize.UUID,
        primaryKey: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      server_seed: {
        type: Sequelize.STRING(128),
        allowNull: false
      },
      server_seed_hash: {
        type: Sequelize.STRING(64),
        allowNull: false
      },
      client_seed: {
        type: Sequelize.STRING(64),
        allowNull: false
      },
      next_nonce: {
        type: Sequelize.BIGINT,
        allowNull: false,
        defaultValue: 0
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    await queryInterface.createTable('user_fair_seed_reveals', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      server_seed: {
        type: Sequelize.STRING(128),
        allowNull: false
      },
      server_seed_hash: {
        type: Sequelize.STRING(64),
        allowNull: false
      },
      nonce_from: {
        type: Sequelize.BIGINT,
        allowNull: false
      },
      nonce_to: {
        type: Sequelize.BIGINT,
        allowNull: false
      },
      revealed_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    await queryInterface.addIndex('user_fair_seed_reveals', ['user_id']);
    await queryInterface.addIndex('user_fair_seed_reveals', ['user_id', 'nonce_from', 'nonce_to']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('user_fair_seed_reveals');
    await queryInterface.dropTable('user_fair_seeds');
  }
};
