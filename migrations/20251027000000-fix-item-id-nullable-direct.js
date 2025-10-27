'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Используем прямой SQL запрос для надежного изменения столбца
    await queryInterface.sequelize.query(
      'ALTER TABLE user_inventory ALTER COLUMN item_id DROP NOT NULL;'
    );
  },

  down: async (queryInterface, Sequelize) => {
    // Откат - делаем поле обязательным (может не сработать если есть NULL значения)
    await queryInterface.sequelize.query(
      'ALTER TABLE user_inventory ALTER COLUMN item_id SET NOT NULL;'
    );
  }
};
