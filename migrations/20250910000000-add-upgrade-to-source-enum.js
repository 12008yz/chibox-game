'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Добавляем новое значение 'upgrade' в enum для поля source
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_user_inventory_source" ADD VALUE 'upgrade';
    `);
  },

  async down(queryInterface, Sequelize) {
    // Откат миграции сложнее для enum в PostgreSQL
    // Нужно пересоздать enum без значения 'upgrade'
    await queryInterface.sequelize.query(`
      -- Создаем новый enum без 'upgrade'
      CREATE TYPE "enum_user_inventory_source_new" AS ENUM('case', 'bonus', 'achievement', 'purchase', 'system');

      -- Обновляем таблицу, используя новый тип
      ALTER TABLE "user_inventory"
      ALTER COLUMN "source" TYPE "enum_user_inventory_source_new"
      USING "source"::text::"enum_user_inventory_source_new";

      -- Удаляем старый enum
      DROP TYPE "enum_user_inventory_source";

      -- Переименовываем новый enum
      ALTER TYPE "enum_user_inventory_source_new" RENAME TO "enum_user_inventory_source";
    `);
  }
};
