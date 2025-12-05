require('dotenv').config();
const { sequelize } = require('../config/database');
const { Payment, User, Transaction } = require('../models');
const { logger } = require('../utils/logger');
const { addExperience } = require('../services/experienceService');

// Получаем invoice number из аргументов командной строки
const invoiceNumber = process.argv[2];

if (!invoiceNumber) {
  console.log('\n❌ Использование: node scripts/manual-complete-payment.js <invoice_number>');
  console.log('   Пример: node scripts/manual-complete-payment.js 59\n');
  process.exit(1);
}

async function manualCompletePayment() {
  try {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🔧 РУЧНОЕ ЗАВЕРШЕНИЕ ПЛАТЕЖА #${invoiceNumber}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Находим платеж
    const payment = await Payment.findOne({
      where: { invoice_number: parseInt(invoiceNumber) },
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'username', 'balance']
      }]
    });

    if (!payment) {
      console.log(`❌ Платеж с номером ${invoiceNumber} не найден\n`);
      await sequelize.close();
      process.exit(1);
    }

    console.log('📋 ИНФОРМАЦИЯ О ПЛАТЕЖЕ:');
    console.log(`   ID: ${payment.id}`);
    console.log(`   Invoice: #${payment.invoice_number}`);
    console.log(`   Сумма: ${payment.amount} ${payment.currency || 'RUB'}`);
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
      } else {
        console.log(`❌ Транзакция НЕ НАЙДЕНА - возможно данные не синхронизированы!`);
      }

      console.log('\n');
      await sequelize.close();
      process.exit(0);
    }

    // Подтверждение
    console.log('\n⚠️  ПОДТВЕРЖДЕНИЕ:');
    console.log('   Вы уверены что хотите вручную завершить этот платеж?');
    console.log('   Это начислит баланс пользователю!');
    console.log('\n   Для подтверждения запустите:');
    console.log(`   node scripts/manual-complete-payment.js ${invoiceNumber} --confirm\n`);

    if (!process.argv.includes('--confirm')) {
      await sequelize.close();
      process.exit(0);
    }

    // ВЫПОЛНЯЕМ ЗАВЕРШЕНИЕ ПЛАТЕЖА
    console.log('\n🚀 ВЫПОЛНЯЕТСЯ ЗАВЕРШЕНИЕ ПЛАТЕЖА...\n');

    const user = payment.user || await User.findByPk(payment.user_id);
    if (!user) {
      console.log(`❌ Пользователь не найден (ID: ${payment.user_id})\n`);
      await sequelize.close();
      process.exit(1);
    }

    const oldBalance = user.balance;

    // Определяем сумму для начисления
    let chicoinsToAdd = parseFloat(payment.amount);
    if (payment.metadata && payment.metadata.chicoins) {
      chicoinsToAdd = parseFloat(payment.metadata.chicoins);
    }

    // Начисляем баланс
    user.balance = (user.balance || 0) + chicoinsToAdd;
    await user.save();

    console.log('✅ Баланс обновлен:');
    console.log(`   Было: ${oldBalance} ChiCoins`);
    console.log(`   Начислено: +${chicoinsToAdd} ChiCoins`);
    console.log(`   Стало: ${user.balance} ChiCoins`);

    // Создаем транзакцию
    const transaction = await Transaction.create({
      user_id: user.id,
      type: payment.purpose === 'subscription' ? 'subscription_purchase' : 'balance_add',
      amount: chicoinsToAdd,
      description: payment.description || `Пополнение баланса (manual complete)`,
      status: 'completed',
      related_entity_id: payment.id,
      related_entity_type: 'Payment',
      balance_before: oldBalance,
      balance_after: user.balance,
      is_system: true, // Отмечаем как системную т.к. ручная
      payment_id: payment.id
    });

    console.log(`\n✅ Транзакция создана (ID: ${transaction.id})`);

    // Обновляем статус платежа
    payment.status = 'completed';
    payment.webhook_received = true;
    payment.completed_at = new Date();
    payment.admin_notes = (payment.admin_notes || '') + `\nМануально завершен через скрипт ${new Date().toISOString()}`;
    await payment.save();

    console.log(`\n✅ Статус платежа обновлен на 'completed'`);

    // Начисляем опыт
    try {
      await addExperience(user.id, chicoinsToAdd, 'deposit');
      console.log(`\n✅ Опыт начислен`);
    } catch (expError) {
      console.log(`\n⚠️  Не удалось начислить опыт: ${expError.message}`);
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ ПЛАТЕЖ УСПЕШНО ЗАВЕРШЕН');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('\n❌ ОШИБКА:', error);
    console.error(error.stack);
  } finally {
    await sequelize.close();
  }
}

manualCompletePayment();
