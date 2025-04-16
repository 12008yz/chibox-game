'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('level_settings', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      level: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true,
        comment: "Номер уровня"
      },
      xp_required: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: "Общее количество XP, необходимое для достижения этого уровня"
      },
      xp_to_next_level: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: "Количество XP для перехода с этого уровня на следующий"
      },
      bonus_percentage: {
        type: Sequelize.FLOAT,
        allowNull: false,
        defaultValue: 0.0,
        comment: "Бонус к дропу предметов на этом уровне (в процентах)"
      },
      daily_cases_bonus: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "Бонусное количество ежедневных кейсов на этом уровне"
      },
      icon_url: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: "URL иконки уровня"
      },
      color_code: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: "Цветовой код для отображения уровня (HEX)"
      },
      special_perks: {
        type: Sequelize.JSON,
        allowNull: true,
        comment: "Специальные бонусы для этого уровня (в формате JSON)"
      },
      reward_description: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: "Описание наград за достижение этого уровня"
      },
      is_milestone: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: "Является ли уровень особым с дополнительными наградами"
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });

    // Добавление индексов
    await queryInterface.addIndex('level_settings', ['level'], { unique: true });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('level_settings');
  }
};
