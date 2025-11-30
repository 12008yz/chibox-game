'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    console.log('🔧 Исправление индекса case_item_drops для разрешения дубликатов...');

    // Удаляем уникальный индекс, который блокировал дубликаты для ВСЕХ кейсов
    await queryInterface.removeIndex('case_item_drops', 'unique_user_case_item_drop');
    console.log('✓ Уникальный индекс удален');

    // Создаем обычный индекс для производительности (без уникальности)
    await queryInterface.addIndex('case_item_drops',
      ['user_id', 'case_template_id', 'item_id'],
      { name: 'case_item_drops_user_case_item_idx' }
    );
    console.log('✓ Обычный индекс создан');
    console.log('✅ Миграция завершена: теперь пользователи могут получать дубликаты предметов из обычных кейсов');
    console.log('   Защита от дубликатов для кейса Статус++ остается в коде');
  },

  down: async (queryInterface, Sequelize) => {
    console.log('⏪ Откат миграции...');

    // Откат: удаляем обычный индекс
    await queryInterface.removeIndex('case_item_drops', 'case_item_drops_user_case_item_idx');
    console.log('✓ Обычный индекс удален');

    // Возвращаем уникальный индекс
    await queryInterface.addIndex('case_item_drops',
      ['user_id', 'case_template_id', 'item_id'],
      {
        unique: true,
        name: 'unique_user_case_item_drop'
      }
    );
    console.log('✓ Уникальный индекс восстановлен');
    console.log('✅ Откат завершен');
  }
};
