'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Change rarity enum to new values
    await queryInterface.sequelize.transaction(async (transaction) => {
      // Postgres requires enum type to be dropped and recreated
      await queryInterface.sequelize.query(`
        ALTER TYPE "enum_items_rarity" RENAME TO "enum_items_rarity_old";
      `, { transaction });

      await queryInterface.sequelize.query(`
        CREATE TYPE "enum_items_rarity" AS ENUM (
          'consumer',
          'industrial',
          'milspec',
          'restricted',
          'classified',
          'covert',
          'contraband',
          'exotic'
        );
      `, { transaction });

      await queryInterface.sequelize.query(`
        ALTER TABLE "items" ALTER COLUMN "rarity" TYPE "enum_items_rarity" USING "rarity"::text::"enum_items_rarity";
      `, { transaction });

      await queryInterface.sequelize.query(`
        DROP TYPE "enum_items_rarity_old";
      `, { transaction });
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Revert rarity enum to old values
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(`
        ALTER TYPE "enum_items_rarity" RENAME TO "enum_items_rarity_new";
      `, { transaction });

      await queryInterface.sequelize.query(`
        CREATE TYPE "enum_items_rarity" AS ENUM (
          'common',
          'uncommon',
          'rare',
          'epic',
          'legendary',
          'mythical'
        );
      `, { transaction });

      await queryInterface.sequelize.query(`
        ALTER TABLE "items" ALTER COLUMN "rarity" TYPE "enum_items_rarity" USING "rarity"::text::"enum_items_rarity";
      `, { transaction });

      await queryInterface.sequelize.query(`
        DROP TYPE "enum_items_rarity_new";
      `, { transaction });
    });
  }
};
