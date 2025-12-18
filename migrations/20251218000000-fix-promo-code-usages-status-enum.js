'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      try {
        console.log('🔧 Исправление enum для promo_code_usages.status...');

        // Обновляем все записи со статусом 'completed' на 'applied'
        const [results] = await queryInterface.sequelize.query(
          `UPDATE promo_code_usages SET status = 'applied' WHERE status::text = 'completed'`,
          { transaction }
        );

        if (results && results.length > 0) {
          console.log(`✅ Обновлено ${results.length} записей со статусом 'completed' на 'applied'`);
        }

        // Пересоздаем enum без 'completed'
        // Сначала удаляем значение по умолчанию
        await queryInterface.sequelize.query(
          `ALTER TABLE promo_code_usages ALTER COLUMN status DROP DEFAULT`,
          { transaction }
        );

        // Создаем новый тип
        await queryInterface.sequelize.query(
          `CREATE TYPE enum_promo_code_usages_status_new AS ENUM ('applied', 'cancelled', 'refunded', 'expired')`,
          { transaction }
        );

        // Изменяем колонку на новый тип
        await queryInterface.sequelize.query(
          `ALTER TABLE promo_code_usages
           ALTER COLUMN status TYPE enum_promo_code_usages_status_new
           USING status::text::enum_promo_code_usages_status_new`,
          { transaction }
        );

        // Удаляем старый тип
        await queryInterface.sequelize.query(
          `DROP TYPE IF EXISTS enum_promo_code_usages_status`,
          { transaction }
        );

        // Переименовываем новый тип
        await queryInterface.sequelize.query(
          `ALTER TYPE enum_promo_code_usages_status_new RENAME TO enum_promo_code_usages_status`,
          { transaction }
        );

        // Устанавливаем значение по умолчанию с правильным приведением типа
        await queryInterface.sequelize.query(
          `ALTER TABLE promo_code_usages ALTER COLUMN status SET DEFAULT 'applied'::enum_promo_code_usages_status`,
          { transaction }
        );

        console.log('✅ Enum promo_code_usages.status успешно исправлен');
      } catch (error) {
        console.error('❌ Ошибка при исправлении enum:', error.message);
        throw error;
      }
    });
  },

  async down(queryInterface, Sequelize) {
    // Откат не требуется, так как это исправление ошибки
    console.log('⚠️  Откат этой миграции не поддерживается');
  }
};
