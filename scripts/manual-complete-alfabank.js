require('dotenv').config();
const { sequelize } = require('../config/database');
const { Payment, User, Transaction } = require('../models');
const { activateSubscription } = require('../services/subscriptionService');
const { addExperience } = require('../services/xpService');

const invoiceNumber = process.argv[2];
const confirm = process.argv.includes('--confirm');

if (!invoiceNumber) {
  console.log('Использование: node scripts/manual-complete-alfabank.js <invoice_number> [--confirm]');
  console.log('Пример: node scripts/manual-complete-alfabank.js 6 --confirm');
  process.exit(1);
}

async function manualCompletePayment() {
  try {
    await sequelize.authenticate();
    console.log('✅ Подключение к БД установлено\n');

    // Находим платеж
    const payment = await Payment.findOne({
      where: { invoice_number: parseInt(invoiceNumber) },
      include: [{ model: User, as: 'user' }]
    });

    if (!payment) {
      console.log(`❌ Платеж с номером ${invoiceNumber} не найден`);
      process.exit(1);
    }

    console.log('📋 ИНФОРМАЦИЯ О ПЛАТЕЖЕ:');
    console.log(`   ID: ${payment.id}`);
    console.log(`   Номер счета: ${payment.invoice_number}`);
    console.log(`   Сумма: ${payment.amount} RUB`);
    console.log(`   Статус: ${payment.status}`);
    console.log(`   Система: ${payment.payment_system}`);
    console.log(`   Назначение: ${payment.purpose}`);
    console.log(`   Дата создания: ${payment.created_at}`);
    console.log(`   Webhook получен: ${payment.webhook_received ? 'Да' : 'Нет'}`);

    if (payment.user) {
      console.log(`\n👤 ПОЛЬЗОВАТЕЛЬ:`);
      console.log(`   ID: ${payment.user.id}`);
      console.log(`   Имя: ${payment.user.username}`);
      console.log(`   Текущий баланс: ${payment.user.balance} ChiCoins`);
    }

    if (payment.metadata) {
      console.log(`\n📦 МЕТАДАННЫЕ:`);
      console.log(`   ${JSON.stringify(payment.metadata, null, 2)}`);
    }

    // Проверяем статус
    if (payment.status === 'completed') {
      console.log('\n⚠️  ВНИМАНИЕ: Этот платеж уже завершен!');

      // Проверяем есть ли транзакция
      const transaction = await Transaction.findOne({
        where: { payment_id: payment.id }
      });

      if (transaction) {
        console.log(`✅ Транзакция существует (ID: ${transaction.id})`);
        console.log(`   Тип: ${transaction.type}`);
        console.log(`   Сумма: ${transaction.amount} ChiCoins`);
      } else {
        console.log(`❌ Транзакция НЕ НАЙДЕНА - возможно данные не синхронизированы!`);
      }

      console.log('\n');
      await sequelize.close();
      process.exit(0);
    }

    if (!confirm) {
      // Подтверждение
      console.log('\n⚠️  ПОДТВЕРЖДЕНИЕ:');
      console.log('   Вы уверены что хотите вручную завершить этот платеж?');
      console.log('   Это начислит баланс пользователю!');
      console.log('\n   Для подтверждения запустите:');
      console.log(`   node scripts/manual-complete-alfabank.js ${invoiceNumber} --confirm\n`);
      await sequelize.close();
      process.exit(0);
    }

    console.log('\n🔄 Обработка платежа...\n');

    const user = await User.findByPk(payment.user_id);
    if (!user) {
      console.log('❌ Пользователь не найден');
      await sequelize.close();
      process.exit(1);
    }

    // Определяем сумму для транзакции
    let transactionAmount = parseFloat(payment.amount);
    if (payment.purpose === 'deposit' && payment.metadata && payment.metadata.chicoins) {
      transactionAmount = parseFloat(payment.metadata.chicoins);
    }

    // Обрабатываем платёж
    if (payment.purpose === 'subscription') {
      console.log(`Активация подписки для пользователя ${user.id}...`);
      const tierId = payment.metadata && payment.metadata.tierId ? payment.metadata.tierId : 1;
      await activateSubscription(user.id, tierId);
      console.log(`✅ Подписка активирована`);
    } else if (payment.purpose === 'deposit') {
      const oldBalance = user.balance;

      // Получаем количество ChiCoins из metadata
      let chicoinsToAdd = parseFloat(payment.amount);
      if (payment.metadata && payment.metadata.chicoins) {
        chicoinsToAdd = parseFloat(payment.metadata.chicoins);
      }

      user.balance = parseFloat(user.balance || 0) + chicoinsToAdd;
      await user.save();

      console.log(`✅ Баланс обновлен:`);
      console.log(`   Было: ${oldBalance} ChiCoins`);
      console.log(`   Добавлено: ${chicoinsToAdd} ChiCoins`);
      console.log(`   Стало: ${user.balance} ChiCoins`);

      // Начисляем опыт
      try {
        await addExperience(user.id, 40, 'deposit', null, 'Пополнение баланса');
        console.log(`✅ Опыт начислен`);
      } catch (expError) {
        console.log(`⚠️  Ошибка начисления опыта: ${expError.message}`);
      }
    }

    // Создаем транзакцию
    const balanceBefore = payment.purpose === 'subscription' ? user.balance : (user.balance - transactionAmount);
    const transaction = await Transaction.create({
      user_id: user.id,
      type: payment.purpose === 'subscription' ? 'subscription_purchase' : 'balance_add',
      amount: transactionAmount,
      description: payment.description,
      status: 'completed',
      related_entity_id: payment.id,
      related_entity_type: 'Payment',
      balance_before: balanceBefore,
      balance_after: user.balance,
      is_system: false,
      payment_id: payment.id
    });

    console.log(`✅ Транзакция создана (ID: ${transaction.id})`);

    // Обновляем статус платежа
    payment.status = 'completed';
    payment.webhook_received = true;
    payment.payment_id = payment.invoice_number.toString();
    payment.webhook_data = { manual_completion: true, completed_at: new Date() };
    payment.completed_at = new Date();
    await payment.save();

    console.log(`\n✅ Платеж успешно обработан вручную!`);
    console.log(`   Пользователь ${user.username} получил ${transactionAmount} ChiCoins`);

    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Ошибка:', error);
    await sequelize.close();
    process.exit(1);
  }
}

manualCompletePayment();
