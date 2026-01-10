require('dotenv').config();
const { sequelize } = require('../config/database');
const { Payment, User, Transaction } = require('../models');
const { activateSubscription } = require('../services/subscriptionService');
const { addExperience } = require('../services/xpService');

const confirm = process.argv.includes('--confirm');

async function completeAllPendingAlfabank() {
  try {
    await sequelize.authenticate();
    console.log('✅ Подключение к БД установлено\n');

    // Находим все pending платежи Альфа-Банка
    const pendingPayments = await Payment.findAll({
      where: {
        payment_system: 'alfabank',
        status: 'pending'
      },
      include: [{ model: User, as: 'user' }],
      order: [['created_at', 'ASC']]
    });

    if (pendingPayments.length === 0) {
      console.log('✅ Нет pending платежей Альфа-Банка');
      await sequelize.close();
      process.exit(0);
    }

    console.log(`📋 Найдено ${pendingPayments.length} pending платежей Альфа-Банка\n`);

    if (!confirm) {
      console.log('⚠️  ВНИМАНИЕ:');
      console.log('   Этот скрипт завершит ВСЕ pending платежи Альфа-Банка!');
      console.log('   Убедитесь, что эти платежи действительно оплачены!');
      console.log('\n   Для подтверждения запустите:');
      console.log('   node scripts/complete-all-pending-alfabank.js --confirm\n');
      await sequelize.close();
      process.exit(0);
    }

    let successCount = 0;
    let errorCount = 0;

    for (const payment of pendingPayments) {
      try {
        console.log(`\n⚙️  Обработка платежа #${payment.invoice_number}...`);

        const user = payment.user || await User.findByPk(payment.user_id);
        if (!user) {
          console.log(`   ❌ Пользователь не найден (ID: ${payment.user_id})`);
          errorCount++;
          continue;
        }

        // Определяем сумму для транзакции
        let transactionAmount = parseFloat(payment.amount);
        if (payment.purpose === 'deposit' && payment.metadata && payment.metadata.chicoins) {
          transactionAmount = parseFloat(payment.metadata.chicoins);
        }

        // Обрабатываем платёж
        if (payment.purpose === 'subscription') {
          console.log(`   Активация подписки для пользователя ${user.id}...`);
          const tierId = payment.metadata && payment.metadata.tierId ? payment.metadata.tierId : 1;
          await activateSubscription(user.id, tierId);
          console.log(`   ✅ Подписка активирована`);
        } else if (payment.purpose === 'deposit') {
          const oldBalance = parseFloat(user.balance || 0);

          // Получаем количество ChiCoins из metadata
          let chicoinsToAdd = parseFloat(payment.amount);
          if (payment.metadata && payment.metadata.chicoins) {
            chicoinsToAdd = parseFloat(payment.metadata.chicoins);
          }

          // Начисляем баланс
          user.balance = oldBalance + chicoinsToAdd;
          await user.save();

          console.log(`   💰 Баланс обновлен: ${oldBalance} → ${user.balance} (+${chicoinsToAdd})`);

          // Начисляем опыт
          try {
            await addExperience(user.id, 40, 'deposit', null, 'Пополнение баланса');
            console.log(`   ✅ Опыт начислен`);
          } catch (expError) {
            console.log(`   ⚠️  Ошибка начисления опыта: ${expError.message}`);
          }
        }

        // Создаем транзакцию
        const balanceBefore = payment.purpose === 'subscription' ? user.balance : (user.balance - transactionAmount);
        const transaction = await Transaction.create({
          user_id: user.id,
          type: payment.purpose === 'subscription' ? 'subscription_purchase' : 'balance_add',
          amount: transactionAmount,
          description: payment.description || `Пополнение баланса (восстановление после callback проблемы)`,
          status: 'completed',
          related_entity_id: payment.id,
          related_entity_type: 'Payment',
          balance_before: balanceBefore,
          balance_after: user.balance,
          is_system: true,
          payment_id: payment.id
        });

        console.log(`   ✅ Транзакция создана (ID: ${transaction.id})`);

        // Обновляем статус платежа
        payment.status = 'completed';
        payment.webhook_received = true;
        payment.payment_id = payment.invoice_number.toString();
        payment.webhook_data = { manual_completion: true, completed_at: new Date() };
        payment.completed_at = new Date();
        await payment.save();

        console.log(`   ✅ Платеж #${payment.invoice_number} успешно обработан`);
        successCount++;
      } catch (error) {
        console.error(`   ❌ Ошибка обработки платежа #${payment.invoice_number}:`, error.message);
        errorCount++;
      }
    }

    console.log(`\n📊 РЕЗУЛЬТАТЫ:`);
    console.log(`   ✅ Успешно обработано: ${successCount}`);
    console.log(`   ❌ Ошибок: ${errorCount}`);

    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Ошибка:', error);
    await sequelize.close();
    process.exit(1);
  }
}

completeAllPendingAlfabank();
