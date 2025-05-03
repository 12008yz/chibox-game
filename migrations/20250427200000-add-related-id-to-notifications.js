'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('notifications', 'related_id', {
      type: Sequelize.UUID,
      allowNull: true,
      comment: 'Связанный ID для уведомления (если есть)'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('notifications', 'related_id');
  }
};
