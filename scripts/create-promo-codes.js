const db = require('../models');

async function createPromoCodes() {
  try {
    console.log('🎁 Создание тестовых промокодов...\n');

    const promoCodes = [
      // Промокоды для пополнения баланса (процентные бонусы)
      {
        code: 'DEPOSIT15',
        description: '+15% к пополнению баланса',
        type: 'balance_percentage',
        value: 15,
        is_percentage: true,
        is_active: true,
        max_usages: null,
        max_usages_per_user: 5, // Можно использовать несколько раз
        usage_count: 0,
        required_user_type: 'any',
        min_user_level: 0,
        min_payment_amount: 100,
        category: 'deposit' // Для пополнения
      },
      {
        code: 'DEPOSIT10',
        description: '+10% к пополнению баланса',
        type: 'balance_percentage',
        value: 10,
        is_percentage: true,
        is_active: true,
        max_usages: null,
        max_usages_per_user: 10,
        usage_count: 0,
        required_user_type: 'any',
        min_user_level: 0,
        min_payment_amount: 50,
        category: 'deposit'
      },
      {
        code: 'DEPOSIT5',
        description: '+5% к пополнению баланса',
        type: 'balance_percentage',
        value: 5,
        is_percentage: true,
        is_active: true,
        max_usages: null,
        max_usages_per_user: 20,
        usage_count: 0,
        required_user_type: 'any',
        min_user_level: 0,
        min_payment_amount: 10,
        category: 'deposit'
      },
      // Обычные промокоды (для профиля)
      {
        code: 'WELCOME100',
        description: 'Приветственный промокод - 100 ChiCoins',
        type: 'balance_add',
        value: 100,
        is_active: true,
        max_usages: null,
        max_usages_per_user: 1,
        usage_count: 0,
        required_user_type: 'any',
        min_user_level: 0,
        category: 'general'
      },
      {
        code: 'BONUS500',
        description: 'Бонус 500 ChiCoins для всех',
        type: 'balance_add',
        value: 500,
        is_active: true,
        max_usages: 100,
        max_usages_per_user: 1,
        usage_count: 0,
        required_user_type: 'any',
        min_user_level: 0,
        category: 'general'
      },
      {
        code: 'VIP7DAYS',
        description: '7 дней VIP статуса бесплатно',
        type: 'subscription_extend',
        value: 7,
        is_active: true,
        max_usages: 50,
        max_usages_per_user: 1,
        usage_count: 0,
        subscription_tier: 1,
        required_user_type: 'any',
        min_user_level: 0,
        category: 'general'
      },
      {
        code: 'MEGA1000',
        description: 'Мега бонус - 1000 ChiCoins',
        type: 'balance_add',
        value: 1000,
        is_active: true,
        max_usages: 20,
        max_usages_per_user: 1,
        usage_count: 0,
        required_user_type: 'any',
        min_user_level: 5,
        category: 'general'
      },
      {
        code: 'LEVEL10GIFT',
        description: 'Подарок для игроков 10 уровня - 2000 ChiCoins',
        type: 'balance_add',
        value: 2000,
        is_active: true,
        max_usages: 30,
        max_usages_per_user: 1,
        usage_count: 0,
        required_user_type: 'any',
        min_user_level: 10,
        category: 'general'
      },
      {
        code: 'VIP30DAYS',
        description: '30 дней VIP+ подписки',
        type: 'subscription_extend',
        value: 30,
        is_active: true,
        max_usages: 10,
        max_usages_per_user: 1,
        usage_count: 0,
        subscription_tier: 2,
        required_user_type: 'any',
        min_user_level: 0,
        category: 'general'
      },
      {
        code: 'TEST50',
        description: 'Тестовый промокод - 50 ChiCoins',
        type: 'balance_add',
        value: 50,
        is_active: true,
        max_usages: null,
        max_usages_per_user: 1,
        usage_count: 0,
        required_user_type: 'any',
        min_user_level: 0,
        category: 'general'
      }
    ];

    let created = 0;
    let skipped = 0;

    for (const promoData of promoCodes) {
      const existing = await db.PromoCode.findOne({ where: { code: promoData.code } });

      if (existing) {
        console.log(`⏭️  Промокод ${promoData.code} уже существует`);
        skipped++;
        continue;
      }

      const promo = await db.PromoCode.create(promoData);
      console.log(`✅ Создан промокод: ${promo.code}`);
      console.log(`   Тип: ${promo.type}`);
      console.log(`   Значение: ${promo.value}`);
      console.log(`   Описание: ${promo.description}`);
      if (promo.min_user_level > 0) {
        console.log(`   Минимальный уровень: ${promo.min_user_level}`);
      }
      if (promo.max_usages) {
        console.log(`   Максимум использований: ${promo.max_usages}`);
      }
      console.log('');
      created++;
    }

    console.log(`\n📊 Итого:`);
    console.log(`   ✅ Создано: ${created}`);
    console.log(`   ⏭️  Пропущено: ${skipped}`);
    console.log(`\n🎉 Готово! Промокоды готовы к использованию.\n`);

    // Показываем список всех активных промокодов
    const allPromos = await db.PromoCode.findAll({
      where: { is_active: true },
      order: [['created_at', 'DESC']]
    });

    console.log('📋 Список всех активных промокодов:');
    console.log('─'.repeat(80));
    allPromos.forEach(promo => {
      console.log(`${promo.code.padEnd(20)} | ${promo.type.padEnd(25)} | ${promo.value} | ${promo.description}`);
    });
    console.log('─'.repeat(80));

  } catch (error) {
    console.error('❌ Ошибка при создании промокодов:', error);
  } finally {
    await db.sequelize.close();
  }
}

createPromoCodes();
