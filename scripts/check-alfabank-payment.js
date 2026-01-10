require('dotenv').config();
const { sequelize } = require('../config/database');
const { Payment, User } = require('../models');
const { getOrderStatus, verifyCallbackChecksum } = require('../services/alfabankService');
const { activateSubscription } = require('../services/subscriptionService');
const { addExperience } = require('../services/xpService');

const invoiceNumber = process.argv[2];

if (!invoiceNumber) {
  console.log('Использование: node scripts/check-alfabank-payment.js <invoice_number>');
  console.log('Пример: node scripts/check-alfabank-payment.js 3');
  process.exit(1);
}

async function checkAndProcessPayment() {
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

    // Проверяем статус через API Альфа-Банка
    console.log('\n🔍 Проверка статуса через API Альфа-Банка...');
    const statusResult = await getOrderStatus(payment.invoice_number.toString());

    if (statusResult.success && statusResult.data) {
      console.log('📊 Статус от API:');
      console.log(JSON.stringify(statusResult.data, null, 2));

      const orderStatus = statusResult.data.orderStatus;
      const orderNumber = statusResult.data.orderNumber || payment.invoice_number.toString();

      if (orderStatus === 2 && payment.status !== 'completed') {
        console.log('\n✅ Платеж успешно оплачен, но не обработан!');
        console.log('   Обрабатываю платеж...\n');

        const user = await User.findByPk(payment.user_id);
        if (!user) {
          console.log('❌ Пользователь не найден');
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
        const transaction = await require('../models').Transaction.create({
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
        payment.payment_id = orderNumber;
        payment.webhook_data = statusResult.data;
        payment.completed_at = new Date();
        await payment.save();

        console.log(`\n✅ Платеж успешно обработан!`);
      } else if (orderStatus === 2 && payment.status === 'completed') {
        console.log('\n✅ Платеж уже обработан');
      } else {
        console.log(`\n⚠️  Статус платежа: ${orderStatus}`);
        console.log('   Статус 2 = успешная оплата');
        console.log('   Другие статусы не обрабатываются автоматически');
      }
    } else {
      console.log('❌ Не удалось получить статус от API');
      console.log('   Ошибка:', statusResult.error);
    }

    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Ошибка:', error);
    await sequelize.close();
    process.exit(1);
  }
}

checkAndProcessPayment();
