
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Safe Cracker - бесплатные попытки
    await queryInterface.addColumn('users', 'free_safecracker_claim_count', {
      type: Sequelize.INTEGER,
      defaultValue: 0,
      allowNull: false,
      comment: 'Количество использованных бесплатных попыток в Safe Cracker'
    });

    await queryInterface.addColumn('users', 'free_safecracker_first_claim_date', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: 'Дата первой бесплатной попытки в Safe Cracker'
    });

    await queryInterface.addColumn('users', 'free_safecracker_last_claim_date', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: 'Дата последней бесплатной попытки в Safe Cracker'
    });

    // Slot - бесплатные попытки
    await queryInterface.addColumn('users', 'free_slot_claim_count', {
      type: Sequelize.INTEGER,
      defaultValue: 0,
      allowNull: false,
      comment: 'Количество использованных бесплатных попыток в Slot'
    });

    await queryInterface.addColumn('users', 'free_slot_first_claim_date', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: 'Дата первой бесплатной попытки в Slot'
    });

    await queryInterface.addColumn('users', 'free_slot_last_claim_date', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: 'Дата последней бесплатной попытки в Slot'
    });

    // Tic-Tac-Toe - бесплатные попытки
    await queryInterface.addColumn('users', 'free_tictactoe_claim_count', {
      type: Sequelize.INTEGER,
      defaultValue: 0,
      allowNull: false,
      comment: 'Количество использованных бесплатных попыток в Tic-Tac-Toe'
    });

    await queryInterface.addColumn('users', 'free_tictactoe_first_claim_date', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: 'Дата первой бесплатной попытки в Tic-Tac-Toe'
    });

    await queryInterface.addColumn('users', 'free_tictactoe_last_claim_date', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: 'Дата последней бесплатной попытки в Tic-Tac-Toe'
    });
  },

  async down(queryInterface, Sequelize) {
    // Safe Cracker
    await queryInterface.removeColumn('users', 'free_safecracker_claim_count');
    await queryInterface.removeColumn('users', 'free_safecracker_first_claim_date');
    await queryInterface.removeColumn('users', 'free_safecracker_last_claim_date');

    // Slot
    await queryInterface.removeColumn('users', 'free_slot_claim_count');
    await queryInterface.removeColumn('users', 'free_slot_first_claim_date');
    await queryInterface.removeColumn('users', 'free_slot_last_claim_date');

    // Tic-Tac-Toe
    await queryInterface.removeColumn('users', 'free_tictactoe_claim_count');
    await queryInterface.removeColumn('users', 'free_tictactoe_first_claim_date');
    await queryInterface.removeColumn('users', 'free_tictactoe_last_claim_date');
  }
};
