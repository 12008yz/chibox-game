const db = require('../models');

/**
 * Скрипт для выдачи подписки и/или пополнения баланса пользователю
 * Использование: node scripts/give-subscription.js <id_или_email_или_username> <tier> <days> [balance]
 * Пример: node scripts/give-subscription.js user@example.com 1 30
 * Пример: node scripts/give-subscription.js username123 3 365 10000
 * Пример: node scripts/give-subscription.js a1b2c3d4-5678-90ab-cdef-1234567890ab 2 90 5000
 *
 * tier: 0 - нет подписки, 1 - Статус, 2 - Статус+, 3 - Статус++
 * days: количество дней подписки
 * balance: (опционально) сумма для пополнения баланса в рублях
 */

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

    // Вычисляем новую дату истечения
    const now = new Date();
    let expiryDate;

    if (user.subscription_expiry_date && new Date(user.subscription_expiry_date) > now) {
      // Если подписка еще активна, добавляем дни к текущей дате истечения
      expiryDate = new Date(user.subscription_expiry_date);
      expiryDate.setDate(expiryDate.getDate() + parseInt(days));
    } else {
      // Если подписки нет или она истекла, создаем новую
      expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + parseInt(days));
    }

    // Подготавливаем данные для обновления
    const updateData = {
      subscription_tier: parseInt(tier),
      subscription_purchase_date: now,
      subscription_expiry_date: expiryDate,
      subscription_days_left: Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24))
    };

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

    // Обновляем данные пользователя
    await user.update(updateData);

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

  } catch (error) {
    console.error('❌ Ошибка при выдаче подписки:', error.message);
    console.error(error);
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

if (args.length < 3) {
  console.log('📖 Использование: node scripts/give-subscription.js <id_или_email_или_username> <tier> <days> [balance]');
  console.log('📖 Примеры:');
  console.log('   node scripts/give-subscription.js user@example.com 1 30');
  console.log('   node scripts/give-subscription.js username123 2 90 5000');
  console.log('   node scripts/give-subscription.js a1b2c3d4-5678-90ab-cdef-1234567890ab 3 365 10000');
  console.log('');
  console.log('🎯 Уровни подписки (tier):');
  console.log('   0 - Нет подписки');
  console.log('   1 - Статус');
  console.log('   2 - Статус+');
  console.log('   3 - Статус++');
  console.log('');
  console.log('📅 Дни (days): количество дней подписки (например, 30, 90, 365)');
  console.log('💰 Баланс (balance): (опционально) сумма пополнения в рублях (например, 1000, 5000, 10000)');
  process.exit(1);
}

const [userIdentifier, tier, days, balanceAmount] = args;

// Валидация
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

// Запускаем
giveSubscription(userIdentifier, tier, days, balanceAmount)
  .then(() => {
    console.log('🎉 Готово!');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Критическая ошибка:', error);
    process.exit(1);
  });
