'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('case_templates', 'price_rub', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      comment: "Цена в рублях (Россия)"
    });

    await queryInterface.addColumn('case_templates', 'price_usd', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      comment: "Цена в долларах США (международная)"
    });

    await queryInterface.addColumn('case_templates', 'price_eur', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      comment: "Цена в евро (Германия, Франция, Испания)"
    });

    await queryInterface.addColumn('case_templates', 'price_jpy', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      comment: "Цена в йенах (Япония)"
    });

    await queryInterface.addColumn('case_templates', 'price_krw', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      comment: "Цена в вонах (Корея)"
    });

    await queryInterface.addColumn('case_templates', 'price_cny', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      comment: "Цена в юанях (Китай)"
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('case_templates', 'price_rub');
    await queryInterface.removeColumn('case_templates', 'price_usd');
    await queryInterface.removeColumn('case_templates', 'price_eur');
    await queryInterface.removeColumn('case_templates', 'price_jpy');
    await queryInterface.removeColumn('case_templates', 'price_krw');
    await queryInterface.removeColumn('case_templates', 'price_cny');
  }
};
