'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableDescription = await queryInterface.describeTable('payments');

    if (!tableDescription.invoice_number) {
      // Добавляем поле invoice_number с автоинкрементом
      await queryInterface.addColumn('payments', 'invoice_number', {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        unique: true,
        allowNull: true,
        comment: 'Числовой номер счета для платежных систем (например, Robokassa)'
      });

      // Создаем последовательность и устанавливаем начальное значение
      await queryInterface.sequelize.query(`
        CREATE SEQUENCE IF NOT EXISTS payments_invoice_number_seq;
        SELECT setval('payments_invoice_number_seq', (SELECT COALESCE(MAX(invoice_number), 0) + 1 FROM payments));
        ALTER TABLE payments ALTER COLUMN invoice_number SET DEFAULT nextval('payments_invoice_number_seq');
      `);
    }
  },

  down: async (queryInterface, Sequelize) => {
    const tableDescription = await queryInterface.describeTable('payments');

    if (tableDescription.invoice_number) {
      await queryInterface.sequelize.query(`DROP SEQUENCE IF EXISTS payments_invoice_number_seq;`);
      await queryInterface.removeColumn('payments', 'invoice_number');
    }
  }
};
