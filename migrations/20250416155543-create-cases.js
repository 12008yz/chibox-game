'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // Создание ENUM типа для источников кейсов
    await queryInterface.sequelize.query('CREATE TYPE "enum_cases_source" AS ENUM(\'subscription\', \'purchase\', \'achievement\', \'gift\', \'event\', \'mission\');');

    await queryInterface.createTable('cases', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'Ежедневный кейс'
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      image_url: {
        type: Sequelize.STRING,
        allowNull: true
      },
      template_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'case_templates',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        comment: "ID шаблона кейса, если кейс создан на основе шаблона"
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        comment: "ID пользователя, владеющего этим кейсом"
      },
      is_opened: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: "Открыт ли этот кейс"
      },
      received_date: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
        comment: "Дата получения кейса пользователем"
      },
      opened_date: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Дата открытия кейса"
      },
      result_item_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'items',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        comment: "ID предмета, который выпал из кейса (если кейс открыт)"
      },
      subscription_tier: {
        type: Sequelize.INTEGER,
        defaultValue: 1,
        comment: "Уровень подписки, при котором был получен кейс"
      },
      drop_bonus_applied: {
        type: Sequelize.FLOAT,
        defaultValue: 0.0,
        comment: "Какой бонус к выпадению был применен при открытии кейса"
      },
      is_paid: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: "Был ли кейс куплен за деньги"
      },
      purchase_price: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        comment: "Цена покупки кейса, если он был куплен"
      },
      source: {
        type: Sequelize.ENUM('subscription', 'purchase', 'achievement', 'gift', 'event', 'mission'),
        defaultValue: 'subscription',
        comment: "Источник получения кейса"
      },
      related_achievement_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: "ID связанного достижения, если кейс получен через достижение"
      },
      related_mission_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: "ID связанной миссии, если кейс получен через миссию"
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Срок действия кейса (null - бессрочно)"
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    // Создаем индексы
    await queryInterface.addIndex('cases', ['user_id']);
    await queryInterface.addIndex('cases', ['is_opened']);
    await queryInterface.addIndex('cases', ['template_id']);
    await queryInterface.addIndex('cases', ['user_id', 'is_opened']);
    await queryInterface.addIndex('cases', ['result_item_id']);
    await queryInterface.addIndex('cases', ['expires_at']);
    await queryInterface.addIndex('cases', ['source']);
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.dropTable('cases');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_cases_source";');
  }
};
