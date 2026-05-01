const db = require('../models');
const redis = require('redis');
const { updateUserBonuses } = require('../utils/userBonusCalculator');
const { snapshotSubscriptionPrior, normalizeSubscriptionStreakAfterChange } = require('../utils/subscriptionStreak');
const { updateUserAchievementProgress } = require('../services/achievementService');

/**
 * Скрипт для выдачи подписки и/или пополнения баланса пользователю
 *
 * Режим 1 — только деньги:
 *   node scripts/give-subscription.js <id_или_email_или_username> <сумма>
 *   Пример: node scripts/give-subscription.js user@example.com 5000
 *
 * Режим 2 — подписка (и опционально деньги):
 *   node scripts/give-subscription.js <id_или_email_или_username> <tier> <days> [balance]
 *   Пример: node scripts/give-subscription.js user@example.com 1 30
 *   Пример: node scripts/give-subscription.js 92fda98d-9f24-47e5-8b63-daa8f2dcc095 2 1 10000
 *
 * tier: 0 - нет подписки, 1 - Статус, 2 - Статус+, 3 - Статус++
 * days: количество дней подписки
 * balance: (опционально) сумма пополнения в ChiCoins
 */

// Инициализируем Redis клиент
let redisClient = null;
async function initRedis() {
  try {
    redisClient = redis.createClient({
      url: process.env.REDIS_URL || 'redis://127.0.0.1:6379'
    });
    await redisClient.connect();
    console.log('✅ Redis подключен');
  } catch (error) {
    console.warn('⚠️  Redis недоступен, кэш не будет очищен:', error.message);
  }
}

// Очистка кэша профиля пользователя
async function clearUserCache(userId) {
  if (!redisClient || !redisClient.isOpen) {
    console.warn('⚠️  Redis не подключен, пропускаем очистку кэша');
    return;
  }

  try {
    // Очищаем все возможные ключи кэша для этого пользователя
    const patterns = [
      `cache:${userId}:*`,
      `*:${userId}:*`,
      `session:${userId}*`
    ];

    let totalDeleted = 0;
    for (const pattern of patterns) {
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) {
        await redisClient.del(keys);
        totalDeleted += keys.length;
        console.log(`🗑️  Очищено ${keys.length} ключей по паттерну "${pattern}"`);
      }
    }

    if (totalDeleted > 0) {
      console.log(`✅ Всего очищено ${totalDeleted} ключей кэша`);
    } else {
      console.log(`ℹ️  Ключи кэша для пользователя не найдены`);
    }
  } catch (error) {
    console.warn('⚠️  Ошибка при очистке кэша:', error.message);
  }
}

async function giveSubscription(userIdentifier, tier, days, balanceAmount = null) {
  try {
    console.log('🔍 Поиск пользователя...');

    // Ищем пользователя по ID, email или username
    const user = await db.User.findOne({
      where: {
        [db.Sequelize.Op.or]: [
          { id: userIdentifier },
          { email: userIdentifier },
          { username: userIdentifier }
        ]
      }
    });

    if (!user) {
      console.error(`❌ Пользователь не найден: ${userIdentifier}`);
      return;
    }

    console.log(`✅ Найден пользователь: ${user.username} (${user.email})`);
    console.log(`📊 Текущая подписка: Tier ${user.subscription_tier}, осталось ${user.subscription_days_left || 0} дней`);
    console.log(`💰 Текущий баланс: ${parseFloat(user.balance || 0).toFixed(2)}₽`);

    // Вычисляем новую дату истечения (как в activateSubscription: продление без сброса purchase_date)
    const now = new Date();
    const prior = snapshotSubscriptionPrior(user);
    let expiryDate;

    if (user.subscription_expiry_date && new Date(user.subscription_expiry_date) > now) {
      expiryDate = new Date(user.subscription_expiry_date);
      expiryDate.setDate(expiryDate.getDate() + parseInt(days));
    } else {
      expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + parseInt(days));
    }

    const updateData = {
      subscription_tier: parseInt(tier),
      subscription_expiry_date: expiryDate,
      subscription_days_left: Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24))
    };

    if (!prior.expiry || new Date(prior.expiry) <= now) {
      updateData.subscription_purchase_date = now;
    }

    user.subscription_tier = updateData.subscription_tier;
    user.subscription_expiry_date = updateData.subscription_expiry_date;
    user.subscription_days_left = updateData.subscription_days_left;
    if (updateData.subscription_purchase_date) {
      user.subscription_purchase_date = updateData.subscription_purchase_date;
    }
    normalizeSubscriptionStreakAfterChange(user, now, prior);

    // Если указана сумма пополнения баланса, добавляем её
    if (balanceAmount !== null && parseFloat(balanceAmount) > 0) {
      const currentBalance = parseFloat(user.balance || 0);
      const addAmount = parseFloat(balanceAmount);
      updateData.balance = currentBalance + addAmount;

      console.log(`\n💸 Пополнение баланса:`);
      console.log(`   Было: ${currentBalance.toFixed(2)}₽`);
      console.log(`   Добавлено: +${addAmount.toFixed(2)}₽`);
      console.log(`   Станет: ${updateData.balance.toFixed(2)}₽`);
    }

    await user.update({
      ...updateData,
      subscription_streak_start_date: user.subscription_streak_start_date
    });

    try {
      await updateUserAchievementProgress(user.id, 'subscription_days', 0);
    } catch (e) {
      console.warn('⚠️  subscription_days achievement:', e.message);
    }

    // Пересчитываем все бонусы пользователя (уровень, подписка, достижения)
    console.log('\n🔄 Пересчёт бонусов...');
    const bonusInfo = await updateUserBonuses(user.id);
    console.log(`✅ Бонусы обновлены:`);
    console.log(`   - Уровень: +${bonusInfo.levelBonus.toFixed(2)}%`);
    console.log(`   - Подписка: +${bonusInfo.subscriptionBonus.toFixed(2)}%`);
    console.log(`   - Достижения: +${bonusInfo.achievementsBonus.toFixed(2)}%`);
    console.log(`   - Общий бонус: +${bonusInfo.totalBonus.toFixed(2)}%`);

    // Записываем в историю подписок
    await db.SubscriptionHistory.create({
      user_id: user.id,
      action: 'admin_grant',
      days: parseInt(days),
      price: 0,
      method: 'admin',
      date: now
    });

    // Создаём транзакцию для пополнения баланса, если была добавлена сумма
    if (balanceAmount !== null && parseFloat(balanceAmount) > 0) {
      await db.Transaction.create({
        user_id: user.id,
        type: 'balance_add',
        amount: parseFloat(balanceAmount),
        description: 'Пополнение баланса администратором',
        status: 'completed',
        balance_before: parseFloat(user.balance || 0) - parseFloat(balanceAmount),
        balance_after: parseFloat(user.balance || 0),
        date: now
      });
    }

    console.log('\n✅ Операция успешно выполнена!');
    console.log(`📊 Новые данные:`);
    console.log(`   - Tier: ${tier} (${getTierName(tier)})`);
    console.log(`   - Дней: ${days}`);
    console.log(`   - Истекает: ${expiryDate.toLocaleString('ru-RU')}`);
    if (balanceAmount !== null && parseFloat(balanceAmount) > 0) {
      console.log(`   - Баланс: ${parseFloat(user.balance || 0).toFixed(2)}₽`);
    }

    // Очищаем кэш профиля пользователя
    await clearUserCache(user.id);

    console.log('\n💡 Пользователю нужно обновить страницу профиля, чтобы увидеть изменения!');

  } catch (error) {
    console.error('❌ Ошибка при выдаче подписки:', error.message);
    console.error(error);
  } finally {
    // Закрываем соединение с Redis
    if (redisClient && redisClient.isOpen) {
      await redisClient.quit();
    }
  }
}

async function giveBalanceOnly(userIdentifier, amount) {
  try {
    console.log('🔍 Поиск пользователя...');

    const user = await db.User.findOne({
      where: {
        [db.Sequelize.Op.or]: [
          { id: userIdentifier },
          { email: userIdentifier },
          { username: userIdentifier }
        ]
      }
    });

    if (!user) {
      console.error(`❌ Пользователь не найден: ${userIdentifier}`);
      return;
    }

    const addAmount = parseFloat(amount);
    if (addAmount <= 0) {
      console.error('❌ Сумма должна быть больше 0');
      return;
    }

    const balanceBefore = parseFloat(user.balance || 0);
    const balanceAfter = balanceBefore + addAmount;

    console.log(`✅ Найден пользователь: ${user.username} (${user.email})`);
    console.log(`💰 Баланс: ${balanceBefore.toFixed(2)} → ${balanceAfter.toFixed(2)} (+${addAmount.toFixed(2)})`);

    await user.update({ balance: balanceAfter });

    const now = new Date();
    await db.Transaction.create({
      user_id: user.id,
      type: 'balance_add',
      amount: addAmount,
      description: 'Пополнение баланса администратором',
      status: 'completed',
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      date: now
    });

    console.log('\n✅ Баланс успешно пополнен!');
    await clearUserCache(user.id);
    console.log('💡 Пользователю нужно обновить страницу, чтобы увидеть изменения.');
  } catch (error) {
    console.error('❌ Ошибка при пополнении баланса:', error.message);
    console.error(error);
  } finally {
    if (redisClient && redisClient.isOpen) {
      await redisClient.quit();
    }
  }
}

function getTierName(tier) {
  const names = {
    0: 'Нет подписки',
    1: 'Статус',
    2: 'Статус+',
    3: 'Статус++'
  };
  return names[tier] || 'Неизвестно';
}

// Получаем аргументы из командной строки
const args = process.argv.slice(2);

if (args.length < 2) {
  console.log('📖 Использование:');
  console.log('');
  console.log('  Только выдать деньги (2 аргумента):');
  console.log('    node scripts/give-subscription.js <id_или_email_или_username> <сумма>');
  console.log('    Пример: node scripts/give-subscription.js user@example.com 5000');
  console.log('');
  console.log('  Выдать подписку (3–4 аргумента):');
  console.log('    node scripts/give-subscription.js <id_или_email_или_username> <tier> <days> [balance]');
  console.log('    Пример: node scripts/give-subscription.js user@example.com 1 30');
  console.log('    Пример: node scripts/give-subscription.js username123 2 90 5000');
  console.log('');
  console.log('🎯 Tier: 0 - Нет подписки, 1 - Статус, 2 - Статус+, 3 - Статус++');
  console.log('💰 Сумма и balance — в ChiCoins');
  process.exit(1);
}

const [userIdentifier, second, third, fourth] = args;

// Режим «только деньги»: 2 аргумента, второй — число (сумма)
const amountNum = parseFloat(second);
const isBalanceOnly = args.length === 2 && !Number.isNaN(amountNum) && amountNum > 0;

if (isBalanceOnly) {
  (async () => {
    await initRedis();
    await giveBalanceOnly(userIdentifier, second);
    console.log('🎉 Готово!');
    process.exit(0);
  })().catch(error => {
    console.error('❌ Критическая ошибка:', error);
    process.exit(1);
  });
} else {
  // Режим подписки
  if (args.length < 3) {
    console.error('❌ Для выдачи подписки нужны: <user> <tier> <days> [balance]');
    process.exit(1);
  }

  const [tier, days, balanceAmount] = [second, third, fourth];

  if (![0, 1, 2, 3].includes(parseInt(tier))) {
    console.error('❌ Неверный tier. Должен быть 0, 1, 2 или 3');
    process.exit(1);
  }

  if (parseInt(days) <= 0) {
    console.error('❌ Количество дней должно быть больше 0');
    process.exit(1);
  }

  if (balanceAmount !== undefined && parseFloat(balanceAmount) < 0) {
    console.error('❌ Сумма пополнения не может быть отрицательной');
    process.exit(1);
  }

  (async () => {
    await initRedis();
    await giveSubscription(userIdentifier, tier, days, balanceAmount);
    console.log('🎉 Готово!');
    process.exit(0);
  })().catch(error => {
    console.error('❌ Критическая ошибка:', error);
    process.exit(1);
  });
}
