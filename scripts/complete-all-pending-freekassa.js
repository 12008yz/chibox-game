require('dotenv').config();
const { sequelize } = require('../config/database');
const { Payment, User, Transaction } = require('../models');
const { logger } = require('../utils/logger');

// Функция для начисления опыта (если сервис существует)
let addExperience;
try {
  addExperience = require('../services/experienceService').addExperience;
} catch (e) {
  addExperience = null;
}

async function completeAllPendingFreekassa() {
  try {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔧 МАССОВОЕ ЗАВЕРШЕНИЕ PENDING ПЛАТЕЖЕЙ FREEKASSA');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Находим все pending платежи FREEKASSA
    const pendingPayments = await Payment.findAll({
      where: {
        status: 'pending',
        payment_system: 'freekassa'
      },
      order: [['created_at', 'ASC']],
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'username', 'balance']
      }]
    });

    if (pendingPayments.length === 0) {
      console.log('✅ Нет pending платежей FREEKASSA для обработки\n');
      await sequelize.close();
      process.exit(0);
    }

    console.log(`📋 НАЙДЕНО ПЛАТЕЖЕЙ: ${pendingPayments.length}\n`);

    let totalChicoins = 0;
    const paymentsList = [];

    for (const payment of pendingPayments) {
      const chicoins = payment.metadata?.chicoins || parseFloat(payment.amount);
      totalChicoins += chicoins;

      paymentsList.push({
        invoice: payment.invoice_number,
        user: payment.user?.username || 'N/A',
        amount: payment.amount,
        chicoins: chicoins,
        date: payment.created_at
      });

      console.log(`   #${payment.invoice_number} | ${payment.user?.username || 'N/A'} | ${payment.amount} RUB → ${chicoins} ChiCoins`);
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📊 ИТОГО К НАЧИСЛЕНИЮ: ${totalChicoins} ChiCoins`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('⚠️  ВНИМАНИЕ:');
    console.log('   Этот скрипт начислит баланс пользователям!');
    console.log('   Убедитесь что ВСЕ эти платежи реально оплачены!');
    console.log('\n   Для подтверждения запустите:');
    console.log('   node scripts/complete-all-pending-freekassa.js --confirm\n');

    if (!process.argv.includes('--confirm')) {
      await sequelize.close();
      process.exit(0);
    }

    // ВЫПОЛНЯЕМ ЗАВЕРШЕНИЕ ВСЕХ ПЛАТЕЖЕЙ
    console.log('\n🚀 НАЧИНАЕМ ОБРАБОТКУ...\n');

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

        const oldBalance = user.balance;
        let chicoinsToAdd = parseFloat(payment.amount);

        if (payment.metadata?.chicoins) {
          chicoinsToAdd = parseFloat(payment.metadata.chicoins);
        }

        // Начисляем баланс
        user.balance = (user.balance || 0) + chicoinsToAdd;
        await user.save();

        console.log(`   💰 Баланс обновлен: ${oldBalance} → ${user.balance} (+${chicoinsToAdd})`);

        // Создаем транзакцию
        const transaction = await Transaction.create({
          user_id: user.id,
          type: payment.purpose === 'subscription' ? 'subscription_purchase' : 'balance_add',
          amount: chicoinsToAdd,
          description: payment.description || `Пополнение баланса (восстановление после webhook проблемы)`,
          status: 'completed',
          related_entity_id: payment.id,
          related_entity_type: 'Payment',
          balance_before: oldBalance,
          balance_after: user.balance,
          is_system: true,
          payment_id: payment.id
        });

        console.log(`   ✅ Транзакция создана (ID: ${transaction.id})`);

        // Обновляем статус платежа
        payment.status = 'completed';
        payment.webhook_received = true;
        payment.completed_at = new Date();
        payment.admin_notes = (payment.admin_notes || '') + `\nМануально завершен массовым скриптом ${new Date().toISOString()}`;
        await payment.save();

        console.log(`   ✅ Платеж завершен`);

        // Начисляем опыт
        if (addExperience) {
          try {
            await addExperience(user.id, chicoinsToAdd, 'deposit');
            console.log(`   ✅ Опыт начислен`);
          } catch (expError) {
            console.log(`   ⚠️  Опыт не начислен: ${expError.message}`);
          }
        }

        successCount++;

      } catch (error) {
        console.log(`   ❌ ОШИБКА: ${error.message}`);
        errorCount++;
      }
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 РЕЗУЛЬТАТЫ:');
    console.log(`   ✅ Успешно: ${successCount}`);
    console.log(`   ❌ Ошибок: ${errorCount}`);
    console.log(`   📦 Всего обработано: ${successCount + errorCount}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('\n❌ КРИТИЧЕСКАЯ ОШИБКА:', error);
    console.error(error.stack);
  } finally {
    await sequelize.close();
  }
}

completeAllPendingFreekassa();
