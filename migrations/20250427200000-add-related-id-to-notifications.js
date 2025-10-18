'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDescription = await queryInterface.describeTable('notifications');

    if (!tableDescription.related_id) {
      await queryInterface.addColumn('notifications', 'related_id', {
        type: Sequelize.UUID,
        allowNull: true,
        comment: 'Связанный ID для уведомления (если есть)'
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const tableDescription = await queryInterface.describeTable('notifications');

    if (tableDescription.related_id) {
      await queryInterface.removeColumn('notifications', 'related_id');
    }
  }
};
