'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('referral_links', 'deleted_at', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: 'Мягкое удаление: ссылка скрыта и не работает, статистика сохраняется'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('referral_links', 'deleted_at');
  }
};
