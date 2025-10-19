'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      // Добавляем новое значение 'subscription' в существующий ENUM тип
      await queryInterface.sequelize.query(`
        DO $$
        BEGIN
          -- Проверяем, существует ли уже значение 'subscription' в enum
          IF NOT EXISTS (
            SELECT 1 FROM pg_enum
            WHERE enumlabel = 'subscription'
            AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'enum_user_inventory_source')
          ) THEN
            ALTER TYPE "enum_user_inventory_source" ADD VALUE 'subscription';
          END IF;
        END $$;
      `);

      console.log('✓ Значение "subscription" успешно добавлено в enum_user_inventory_source');
    } catch (error) {
      console.error('Ошибка при добавлении значения в ENUM:', error.message);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    // PostgreSQL не поддерживает удаление значений из ENUM напрямую
    // Для отката потребуется пересоздание enum и обновление всех связанных данных
    console.log('Откат изменения ENUM требует ручного вмешательства');
    console.log('Необходимо выполнить пересоздание enum типа, если требуется удалить значение "subscription"');
  }
};
