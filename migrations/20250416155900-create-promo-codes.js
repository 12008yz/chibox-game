'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // Создание ENUM типов
    try {
      await queryInterface.sequelize.query(`
        CREATE TYPE "enum_promo_codes_type" AS ENUM(
          'balance_add',
          'balance_percentage',
          'subscription_discount',
          'subscription_extend',
          'case_bonus',
          'drop_rate_boost'
        );
      `).catch(err => {
        if (err.message.includes('already exists')) {
          console.log('ENUM тип "enum_promo_codes_type" уже существует');
        } else {
          throw err;
        }
      });

      await queryInterface.sequelize.query(`
        CREATE TYPE "enum_promo_codes_required_user_type" AS ENUM(
          'new',
          'returning',
          'subscribed',
          'any'
        );
      `).catch(err => {
        if (err.message.includes('already exists')) {
          console.log('ENUM тип "enum_promo_codes_required_user_type" уже существует');
        } else {
          throw err;
        }
      });
    } catch (error) {
      console.error('Ошибка при создании ENUM типов:', error.message);
    }

    await queryInterface.createTable('promo_codes', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      code: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
        comment: "Код промокода (например, 'BONUS50', 'WELCOME10')"
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: "Описание промокода, его назначение"
      },
      type: {
        type: Sequelize.ENUM(
          'balance_add',
          'balance_percentage',
          'subscription_discount',
          'subscription_extend',
          'case_bonus',
          'drop_rate_boost'
        ),
        allowNull: false,
        comment: "Тип промокода, определяющий его эффект"
      },
      value: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.00,
        comment: "Значение промокода (сумма в рублях, процент скидки, количество дней/кейсов)"
      },
      is_percentage: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: "Является ли значение процентом (например, 10%)"
      },
      min_payment_amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        comment: "Минимальная сумма пополнения для применения промокода"
      },
      max_discount_amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        comment: "Максимальная сумма скидки при использовании процентного промокода"
      },
      start_date: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
        comment: "Дата начала действия промокода"
      },
      end_date: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Дата окончания действия промокода (null = бессрочный)"
      },
      max_usages: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: "Максимальное количество использований промокода (null = неограниченно)"
      },
      max_usages_per_user: {
        type: Sequelize.INTEGER,
        defaultValue: 1,
        comment: "Максимальное количество использований промокода одним пользователем"
      },
      usage_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "Текущее количество использований промокода"
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        comment: "Активен ли промокод"
      },
      subscription_tier: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: "Уровень подписки, к которому применяется промокод (null = ко всем)"
      },
      created_by_admin_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: "ID администратора, создавшего промокод"
      },
      required_user_type: {
        type: Sequelize.ENUM('new', 'returning', 'subscribed', 'any'),
        defaultValue: 'any',
        comment: "Тип пользователя, которому доступен промокод (новый, возвращающийся, с подпиской, любой)"
      },
      min_user_level: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: "Минимальный уровень пользователя для использования промокода"
      },
      is_hidden: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: "Скрытый промокод (не отображается в списках, но работает)"
      },
      for_specific_users: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: "Промокод для конкретных пользователей (определенных в PromoCodeUser)"
      },
      applies_to_payment_systems: {
        type: Sequelize.JSON,
        allowNull: true,
        comment: "Список платежных систем, к которым применяется промокод (null = все)"
      },
      color_code: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: "Цветовой код для отображения промокода (HEX)"
      },
      icon_url: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: "URL иконки промокода"
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
    try {
      await queryInterface.addIndex('promo_codes', ['code'], { unique: true });
      await queryInterface.addIndex('promo_codes', ['is_active']);
      await queryInterface.addIndex('promo_codes', ['start_date']);
      await queryInterface.addIndex('promo_codes', ['end_date']);
      await queryInterface.addIndex('promo_codes', ['type']);
      await queryInterface.addIndex('promo_codes', ['subscription_tier']);
    } catch (error) {
      console.error('Ошибка при создании индексов:', error.message);
    }
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.dropTable('promo_codes');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_promo_codes_type";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_promo_codes_required_user_type";');
  }
};
