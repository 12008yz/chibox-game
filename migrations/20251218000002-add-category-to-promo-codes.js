'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Создаем enum для категорий промокодов
    await queryInterface.sequelize.query(`
      CREATE TYPE "enum_promo_codes_category" AS ENUM ('deposit', 'general');
    `);

    // Добавляем колонку category
    await queryInterface.addColumn('promo_codes', 'category', {
      type: Sequelize.ENUM('deposit', 'general'),
      defaultValue: 'general',
      allowNull: false,
      comment: "Категория промокода: deposit - для пополнения баланса, general - обычные промокоды"
    });
  },

  async down(queryInterface, Sequelize) {
    // Удаляем колонку
    await queryInterface.removeColumn('promo_codes', 'category');

    // Удаляем enum
    await queryInterface.sequelize.query(`
      DROP TYPE IF EXISTS "enum_promo_codes_category";
    `);
  }
};
