'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('achievements', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: "Название достижения"
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: "Описание достижения, что требуется сделать"
      },
      xp_reward: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "Количество XP, которое получает пользователь за выполнение достижения"
      },
      icon_url: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: "URL иконки достижения"
      },
      requirement_type: {
        type: Sequelize.ENUM(
          'cases_opened',           // Количество открытых кейсов
          'rare_items_found',       // Количество редких предметов
          'premium_items_found',    // Предметы стоимостью от 100 руб
          'subscription_days',      // Дни с активной подпиской
          'daily_streak',           // Дни подряд с открытием кейса
          'total_items_value',      // Общая стоимость предметов
          'best_item_value'         // Самый дорогой предмет
        ),
        allowNull: false,
        comment: "Тип требования для получения достижения"
      },
      requirement_value: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: "Требуемое значение для получения достижения"
      },
      bonus_percentage: {
        type: Sequelize.FLOAT,
        allowNull: false,
        defaultValue: 0.0,
        comment: "Бонус к вероятности выпадения ценных предметов в процентах"
      },
      min_item_price_for_bonus: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 100.00,
        comment: "Минимальная стоимость предмета, для которого действует бонус"
      },
      is_visible: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        comment: "Видимо ли достижение до его получения"
      },
      category: {
        type: Sequelize.ENUM(
          'beginner',    // Достижения для новичков
          'collector',   // Коллекционирование предметов
          'regular',     // Регулярная активность
          'expert',      // Экспертный уровень
          'legendary'    // Легендарные достижения
        ),
        allowNull: false,
        defaultValue: 'regular',
        comment: "Категория достижения"
      },
      display_order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "Порядок отображения в списке"
      },
      badge_color: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: "Цвет фона значка достижения (HEX)"
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        comment: "Активно ли достижение (может ли быть получено)"
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
    await queryInterface.addIndex('achievements', ['requirement_type']);
    await queryInterface.addIndex('achievements', ['category']);
    await queryInterface.addIndex('achievements', ['is_active']);
    await queryInterface.addIndex('achievements', ['display_order']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('achievements');
  }
};
