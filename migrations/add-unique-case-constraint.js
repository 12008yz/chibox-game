'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Добавляем уникальный составной индекс для предотвращения дубликатов кейсов
    // Один пользователь не может иметь несколько активных кейсов одного шаблона
    await queryInterface.addIndex('user_inventory', {
      fields: ['user_id', 'case_template_id', 'status'],
      unique: true,
      name: 'unique_active_case_per_user_template',
      where: {
        item_type: 'case',
        status: 'inventory'
      }
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Удаляем индекс при откате миграции
    await queryInterface.removeIndex('user_inventory', 'unique_active_case_per_user_template');
  }
};
