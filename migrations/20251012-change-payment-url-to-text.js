'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Изменяем тип поля payment_url с VARCHAR(255) на TEXT
    await queryInterface.changeColumn('payments', 'payment_url', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: "URL для оплаты (перенаправление пользователя)"
    });
  },

  async down(queryInterface, Sequelize) {
    // Возвращаем обратно к VARCHAR(255)
    await queryInterface.changeColumn('payments', 'payment_url', {
      type: Sequelize.STRING,
      allowNull: true,
      comment: "URL для оплаты (перенаправление пользователя)"
    });
  }
};
