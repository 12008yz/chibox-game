'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add 'subscription_purchased' to enum enum_achievements_requirement_type
    await queryInterface.sequelize.query(`
      ALTER TYPE enum_achievements_requirement_type ADD VALUE IF NOT EXISTS 'subscription_purchased';
      ALTER TYPE enum_achievements_requirement_type ADD VALUE IF NOT EXISTS 'exchange_item';
    `);
  },

  async down(queryInterface, Sequelize) {
    // Note: Removing a value from an enum type is not straightforward in PostgreSQL
    // This down migration is left empty intentionally
  }
};
