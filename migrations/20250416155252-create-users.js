'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // Создание ENUM типов перед созданием таблицы
    await queryInterface.sequelize.query('CREATE TYPE "enum_users_role" AS ENUM(\'user\', \'moderator\', \'admin\', \'superadmin\');');

    await queryInterface.createTable('users', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      username: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
        validate: {
          len: [3, 30]
        }
      },
      email: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
        validate: {
          isEmail: true
        }
      },
      password: {
        type: Sequelize.STRING,
        allowNull: false
      },
      role: {
        type: Sequelize.ENUM('user', 'moderator', 'admin', 'superadmin'),
        defaultValue: 'user',
        allowNull: false,
        comment: "Роль пользователя в системе"
      },
      is_email_verified: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: "Подтвержден ли email"
      },
      email_verification_token: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: "Токен для подтверждения email"
      },
      email_verification_expires: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Срок действия токена подтверждения email"
      },
      password_reset_token: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: "Токен для сброса пароля"
      },
      password_reset_expires: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Срок действия токена сброса пароля"
      },
      tfa_enabled: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: "Включена ли двухфакторная аутентификация"
      },
      tfa_secret: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: "Секрет для двухфакторной аутентификации"
      },
      tfa_backup_codes: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        allowNull: true,
        comment: "Резервные коды для двухфакторной аутентификации"
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      is_banned: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      ban_reason: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: "Причина блокировки"
      },
      ban_expires: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Дата окончания временной блокировки (null - бессрочно)"
      },
      level: {
        type: Sequelize.INTEGER,
        defaultValue: 1,
        comment: "Текущий уровень пользователя"
      },
      xp: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "Текущее количество опыта пользователя"
      },
      xp_to_next_level: {
        type: Sequelize.INTEGER,
        defaultValue: 100,
        comment: "Количество XP, необходимое для перехода на следующий уровень"
      },
      level_bonus_percentage: {
        type: Sequelize.FLOAT,
        defaultValue: 0.0,
        comment: "Бонус к выпадению предметов от уровня пользователя (в %)"
      },
      total_xp_earned: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "Общее количество XP, заработанное пользователем за все время"
      },
      steam_id: {
        type: Sequelize.STRING,
        allowNull: true,
        unique: true,
        comment: "Steam ID пользователя для аутентификации"
      },
      steam_username: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: "Имя пользователя в Steam"
      },
      steam_avatar: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: "URL аватара пользователя в Steam"
      },
      steam_profile_url: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: "URL профиля пользователя в Steam"
      },
      steam_trade_url: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: "URL для обмена Steam (нужен для вывода предметов)"
      },
      subscription_tier: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "0 - нет подписки, 1 - Статус, 2 - Статус+, 3 - Статус++"
      },
      subscription_purchase_date: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Дата покупки подписки"
      },
      subscription_expiry_date: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Дата истечения подписки (30 дней от даты покупки)"
      },
      cases_available: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "Количество доступных кейсов для открытия"
      },
      cases_opened_today: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "Количество кейсов, открытых сегодня"
      },
      next_case_available_time: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Время, когда будет доступен следующий ежедневный кейс"
      },
      max_daily_cases: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "Максимальное количество кейсов в день (зависит от подписки)"
      },
      last_reset_date: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Дата последнего сброса счетчика открытых кейсов"
      },
      next_bonus_available_time: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Время, когда будет доступен следующий бонус"
      },
      last_bonus_date: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Дата последнего полученного бонуса"
      },
      lifetime_bonuses_claimed: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "Общее количество полученных бонусов"
      },
      successful_bonus_claims: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "Количество успешных угадываний ячеек"
      },
      drop_rate_modifier: {
        type: Sequelize.FLOAT,
        defaultValue: 1.0,
        comment: "Базовый модификатор вероятности выпадения редких предметов"
      },
      achievements_bonus_percentage: {
        type: Sequelize.FLOAT,
        defaultValue: 0.0,
        comment: "Суммарный бонус в процентах от достижений (например, 5.5 = +5.5%)"
      },
      subscription_bonus_percentage: {
        type: Sequelize.FLOAT,
        defaultValue: 0.0,
        comment: "Бонус в процентах от подписки (например, 3.0 = +3% для Статус+)"
      },
      total_drop_bonus_percentage: {
        type: Sequelize.FLOAT,
        defaultValue: 0.0,
        comment: "Общий бонус к выпадению предметов (сумма бонусов от достижений, подписки и уровня)"
      },
      balance: {
        type: Sequelize.DECIMAL(10, 2),
        defaultValue: 0.00,
        comment: "Баланс пользователя (для покупки подписки, продажи предметов и т.д.)"
      },
      total_cases_opened: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "Общее количество открытых кейсов"
      },
      total_items_value: {
        type: Sequelize.DECIMAL(12, 2),
        defaultValue: 0.00,
        comment: "Общая стоимость полученных предметов"
      },
      best_item_value: {
        type: Sequelize.DECIMAL(10, 2),
        defaultValue: 0.00,
        comment: "Стоимость самого дорогого полученного предмета"
      },
      daily_streak: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "Текущая серия дней подряд с открытием кейса"
      },
      max_daily_streak: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "Максимальная серия дней подряд с открытием кейса"
      },
      registration_date: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
        comment: "Дата регистрации пользователя"
      },
      last_login_date: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Дата последнего входа пользователя"
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
    await queryInterface.addIndex('users', ['email'], { unique: true });
    await queryInterface.addIndex('users', ['username'], { unique: true });
    await queryInterface.addIndex('users', ['steam_id'], { unique: true });
    await queryInterface.addIndex('users', ['subscription_tier']);
    await queryInterface.addIndex('users', ['subscription_expiry_date']);
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.dropTable('users');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_users_role";');
  }
};
