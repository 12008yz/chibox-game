'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Удаляем default значение для rarity вне транзакции
    await queryInterface.sequelize.query(`
      ALTER TABLE "items" ALTER COLUMN "rarity" DROP DEFAULT;
    `);

    await queryInterface.sequelize.transaction(async (transaction) => {
      // Переименовываем старый enum
      await queryInterface.sequelize.query(`
        ALTER TYPE "enum_items_rarity" RENAME TO "enum_items_rarity_old";
      `, { transaction });

      // Создаем новый enum с новыми значениями
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

      // Меняем тип колонки rarity на новый enum
      await queryInterface.sequelize.query(`
        ALTER TABLE "items" ALTER COLUMN "rarity" TYPE "enum_items_rarity" USING "rarity"::text::"enum_items_rarity";
      `, { transaction });

      // Обновляем несовместимые значения rarity на 'consumer'
      await queryInterface.sequelize.query(`
        UPDATE "items" SET "rarity" = 'consumer' WHERE "rarity" NOT IN ('consumer', 'industrial', 'milspec', 'restricted', 'classified', 'covert', 'contraband', 'exotic');
      `, { transaction });

      // Восстанавливаем default значение rarity
      await queryInterface.sequelize.query(`
        ALTER TABLE "items" ALTER COLUMN "rarity" SET DEFAULT 'consumer';
      `, { transaction });

      // Удаляем старый enum
      await queryInterface.sequelize.query(`
        DROP TYPE "enum_items_rarity_old";
      `, { transaction });
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.query(`
      ALTER TABLE "items" ALTER COLUMN "rarity" DROP DEFAULT;
    `);

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
        UPDATE "items" SET "rarity" = 'common' WHERE "rarity" NOT IN ('common', 'uncommon', 'rare', 'epic', 'legendary', 'mythical');
      `, { transaction });

      await queryInterface.sequelize.query(`
        ALTER TABLE "items" ALTER COLUMN "rarity" SET DEFAULT 'common';
      `, { transaction });

      await queryInterface.sequelize.query(`
        DROP TYPE "enum_items_rarity_new";
      `, { transaction });
    });
  }
};
