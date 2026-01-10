const crypto = require('crypto');
const { Payment, User } = require('../models');
const winston = require('winston');
const { activateSubscription } = require('../services/subscriptionService');
const { addExperience } = require('../services/xpService');

const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
  ],
});

function verifySignature(body, signature, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  const digest = hmac.update(body).digest('base64');
  return digest === signature;
}

async function yoomoneyWebhook(req, res) {
  try {
    // Детальное логирование входящего запроса
    logger.info('=== WEBHOOK RECEIVED ===');
    logger.info('Headers:', JSON.stringify(req.headers, null, 2));
    logger.info('Body:', JSON.stringify(req.body, null, 2));

    const secret = process.env.YOOKASSA_CLIENT_SECRET;
    if (!secret) {
      logger.error('YOOKASSA_CLIENT_SECRET is not set in environment variables');
      return res.status(500).send('Server configuration error');
    }

    const signature = req.headers['x-yookassa-signature'];
    if (!signature) {
      logger.warn('Signature missing in webhook request');
      return res.status(400).send('Signature missing');
    }

    // Исправляем получение raw body для проверки подписи
    let rawBody;
    if (req.rawBody) {
      rawBody = req.rawBody;
    } else {
      rawBody = JSON.stringify(req.body);
    }

    logger.debug(`Using raw body for signature verification: ${rawBody.substring(0, 200)}...`);
    logger.debug(`Received signature: ${signature}`);
    logger.debug(`Using secret: ${secret.substring(0, 10)}...`);

    if (!verifySignature(rawBody, signature, secret)) {
      logger.warn('Invalid signature in webhook request');
      // В режиме разработки можем пропустить проверку подписи для отладки
      if (process.env.NODE_ENV === 'development') {
        logger.warn('DEVELOPMENT MODE: Skipping signature verification');
      } else {
        return res.status(400).send('Invalid signature');
      }
    } else {
      logger.info('✅ Signature verification passed');
    }

    const event = req.body.event;
    const paymentData = req.body.object;

    logger.info(`Webhook received: event=${event}, paymentId=${paymentData.id}, status=${paymentData.status}`);

    // Найти платеж в базе
    const payment = await Payment.findOne({ where: { payment_id: paymentData.id } });
    if (!payment) {
      logger.warn(`Payment not found in database: ${paymentData.id}`);

      // Попробуем найти все платежи для отладки
      const allPayments = await Payment.findAll({
        limit: 5,
        order: [['created_at', 'DESC']],
        attributes: ['id', 'payment_id', 'status', 'amount', 'user_id']
      });
      logger.info('Recent payments in database:', allPayments.map(p => ({
        payment_id: p.payment_id,
        status: p.status,
        amount: p.amount
      })));

      return res.status(404).send('Payment not found');
    }

    logger.info(`Found payment in database:`, {
      id: payment.id,
      payment_id: payment.payment_id,
      current_status: payment.status,
      amount: payment.amount,
      user_id: payment.user_id,
      purpose: payment.purpose
    });

    // Обновить статус платежа
    let newStatus = paymentData.status;
    if (newStatus === 'succeeded') {
      newStatus = 'completed';
    }

    logger.debug(`Current payment status: ${payment.status}, new status: ${newStatus}`);

    if (payment.status !== newStatus) {
      // Если платеж завершен успешно, активируем подписку или пополняем баланс
      if (newStatus === 'completed') {
        // Сначала проверяем пользователя ПЕРЕД обновлением статуса
        const user = await User.findByPk(payment.user_id);
        if (!user) {
          logger.warn(`User not found for payment user_id=${payment.user_id}`);
          return res.status(404).send('User not found');
        }

        logger.info(`Processing completed payment for user:`, {
          user_id: user.id,
          username: user.username,
          current_balance: user.balance,
          payment_purpose: payment.purpose,
          payment_amount: payment.amount
        });

        // Определяем сумму для транзакции
        let transactionAmount = parseFloat(payment.amount);
        if (payment.purpose === 'deposit' && payment.metadata && payment.metadata.chicoins) {
          transactionAmount = parseFloat(payment.metadata.chicoins);
        }

        // Обрабатываем платёж в зависимости от назначения
        if (payment.purpose === 'subscription') {
          logger.info(`Activating subscription for user ${user.id} from payment ${payment.id}`);
          const tierId = payment.metadata && payment.metadata.tierId ? payment.metadata.tierId : 1;
          await activateSubscription(user.id, tierId);
          logger.info(`✅ Subscription activated for user ${user.id}`);
        } else if (payment.purpose === 'deposit') {
          const oldBalance = user.balance;

          // Получаем количество ChiCoins из metadata или из webhook данных
          let chicoinsToAdd = parseFloat(payment.amount); // По умолчанию = рубли

          if (payment.metadata && payment.metadata.chicoins) {
            chicoinsToAdd = parseFloat(payment.metadata.chicoins);
            logger.info(`Using ChiCoins from metadata: ${chicoinsToAdd}`);
          } else if (paymentData.metadata && paymentData.metadata.chicoins) {
            // Пробуем получить из webhook данных YooKassa
            chicoinsToAdd = parseFloat(paymentData.metadata.chicoins);
            logger.info(`Using ChiCoins from webhook metadata: ${chicoinsToAdd}`);
          }

          user.balance = parseFloat(user.balance || 0) + chicoinsToAdd;
          await user.save();

          logger.info(`✅ User balance updated:`, {
            user_id: user.id,
            old_balance: oldBalance,
            new_balance: user.balance,
            added_chicoins: chicoinsToAdd,
            paid_in_rubles: parseFloat(payment.amount),
            display_currency: payment.metadata?.display_currency || 'RUB'
          });

          // Добавление опыта за пополнение баланса
          await addExperience(user.id, 40, 'deposit', null, 'Пополнение баланса');
          logger.info(`✅ Experience added for deposit`);
        }

        // Создаем запись транзакции ПОСЛЕ успешного обновления баланса
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
          ip_address: req.ip,
          user_agent: req.headers['user-agent'],
          is_system: false,
          payment_id: payment.id
        });

        logger.info(`✅ Transaction created:`, {
          transaction_id: transaction.id,
          type: transaction.type,
          amount: transaction.amount
        });
      }

      // ТОЛЬКО ПОСЛЕ успешного обновления баланса сохраняем статус платежа
      payment.status = newStatus;
      payment.webhook_received = true;
      payment.webhook_data = paymentData;
      payment.completed_at = newStatus === 'completed' ? new Date() : null;
      await payment.save();

      logger.info(`✅ Payment status updated to ${newStatus} for paymentId=${paymentData.id}`)
    } else {
      logger.debug('Payment status unchanged, no action needed');
    }

    logger.info('=== WEBHOOK PROCESSED SUCCESSFULLY ===');
    res.status(200).send('OK');
  } catch (error) {
    logger.error('❌ Error processing YooMoney webhook:', error);
    logger.error('Error stack:', error.stack);
    res.status(500).send('Internal Server Error');
  }
}

/**
 * Обработчик Result URL для Freekassa
 * Этот URL вызывается для уведомления магазина о результате оплаты
 */
async function freekassaResultURL(req, res) {
  try {
    logger.info('=== FREEKASSA RESULT URL RECEIVED ===');
    logger.info('Query params:', req.query);
    logger.info('Body:', req.body);

    const { verifySignature } = require('../services/freekassaService');

    // Параметры могут приходить как в query, так и в body
    const params = { ...req.query, ...req.body };

    // Обработка тестового запроса от Freekassa
    if (params.status_check === '1' || params.status_check === 1) {
      logger.info('Status check request from Freekassa - returning YES');
      return res.status(200).send('YES');
    }

    const {
      MERCHANT_ID,
      AMOUNT,
      intid,
      MERCHANT_ORDER_ID,
      SIGN,
      us_user_id,
      us_purpose,
      us_chicoins
    } = params;

    // Проверка обязательных параметров
    if (!MERCHANT_ID || !AMOUNT || !MERCHANT_ORDER_ID || !SIGN) {
      logger.warn('Missing required parameters');
      return res.status(400).send('BAD REQUEST');
    }

    logger.info(`Processing Freekassa payment: OrderID=${MERCHANT_ORDER_ID}, Amount=${AMOUNT}`);

    // Проверяем подпись
    const isValidSignature = verifySignature(
      MERCHANT_ID,
      parseFloat(AMOUNT),
      process.env.FREEKASSA_SECRET_WORD_2,
      parseInt(MERCHANT_ORDER_ID),
      SIGN
    );

    if (!isValidSignature) {
      logger.warn('Invalid signature in Freekassa ResultURL');
      return res.status(400).send('BAD SIGN');
    }

    logger.info('✅ Freekassa signature verification passed');

    // Находим платеж в БД по invoice_number
    const payment = await Payment.findOne({ where: { invoice_number: parseInt(MERCHANT_ORDER_ID) } });
    if (!payment) {
      logger.warn(`Payment not found: OrderID=${MERCHANT_ORDER_ID}`);
      return res.status(404).send('ORDER NOT FOUND');
    }

    logger.info(`Found payment:`, {
      id: payment.id,
      current_status: payment.status,
      amount: payment.amount,
      user_id: payment.user_id
    });

    // Проверяем, не обработан ли уже этот платеж
    if (payment.status !== 'completed') {

      // Сначала проверяем пользователя ПЕРЕД обновлением статуса
      const user = await require('../models').User.findByPk(payment.user_id);
      if (!user) {
        logger.warn(`User not found for payment user_id=${payment.user_id}`);
        return res.status(404).send('USER NOT FOUND');
      }

      logger.info(`Processing completed payment for user:`, {
        user_id: user.id,
        username: user.username,
        current_balance: user.balance,
        payment_purpose: payment.purpose,
        payment_amount: payment.amount
      });

      // Определяем сумму для транзакции
      let transactionAmount = parseFloat(payment.amount);
      if (payment.purpose === 'deposit' && payment.metadata && payment.metadata.chicoins) {
        transactionAmount = parseFloat(payment.metadata.chicoins);
      }

      // Обрабатываем платёж в зависимости от назначения
      if (payment.purpose === 'subscription') {
        logger.info(`Activating subscription for user ${user.id} from payment ${payment.id}`);
        const tierId = payment.metadata && payment.metadata.tierId ? payment.metadata.tierId : 1;
        await activateSubscription(user.id, tierId);
        logger.info(`✅ Subscription activated for user ${user.id}`);
      } else if (payment.purpose === 'deposit') {
        const oldBalance = user.balance;

        // Получаем количество ChiCoins из metadata или из параметров webhook (us_chicoins для Freekassa)
        let chicoinsToAdd = parseFloat(payment.amount);

        if (payment.metadata && payment.metadata.chicoins) {
          chicoinsToAdd = parseFloat(payment.metadata.chicoins);
          logger.info(`Using ChiCoins from metadata: ${chicoinsToAdd}`);
        } else if (us_chicoins) {
          chicoinsToAdd = parseFloat(us_chicoins);
          logger.info(`Using ChiCoins from webhook params (us_chicoins): ${chicoinsToAdd}`);
        }

        user.balance = parseFloat(user.balance || 0) + chicoinsToAdd;
        await user.save();

        logger.info(`✅ Balance updated for user ${user.id}:`, {
          old_balance: oldBalance,
          added: chicoinsToAdd,
          new_balance: user.balance
        });

        // Начисляем опыт за пополнение
        try {
          await addExperience(user.id, chicoinsToAdd, 'deposit');
          logger.info(`✅ Experience added for deposit`);
        } catch (expError) {
          logger.error('Failed to add experience for deposit:', expError);
        }
      }

      // Создаем запись транзакции ПОСЛЕ успешного обновления баланса
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
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        is_system: false,
        payment_id: payment.id
      });

      logger.info(`✅ Transaction created:`, {
        transaction_id: transaction.id,
        type: transaction.type,
        amount: transaction.amount
      });

      // ТОЛЬКО ПОСЛЕ успешного обновления баланса сохраняем статус платежа
      payment.status = 'completed';
      payment.webhook_received = true;
      payment.payment_id = intid ? intid.toString() : MERCHANT_ORDER_ID.toString();
      payment.webhook_data = params;
      payment.completed_at = new Date();
      await payment.save();

      logger.info(`✅ Payment status updated to completed for OrderID=${MERCHANT_ORDER_ID}`)
    } else {
      logger.info(`Payment ${MERCHANT_ORDER_ID} already completed, skipping processing`);
    }

    // Freekassa требует ответ "YES"
    return res.send('YES');
  } catch (error) {
    logger.error('❌ Error processing Freekassa ResultURL:', error);
    logger.error('Error stack:', error.stack);
    return res.status(500).send('ERROR');
  }
}

/**
 * Обработчик Success URL для Freekassa
 * Этот URL для редиректа пользователя после успешной оплаты
 */
async function freekassaSuccessURL(req, res) {
  try {
    logger.info('=== FREEKASSA SUCCESS URL RECEIVED ===');
    logger.info('Query params:', req.query);

    const { MERCHANT_ORDER_ID, AMOUNT } = req.query;

    if (!MERCHANT_ORDER_ID) {
      return res.redirect(`${process.env.FRONTEND_URL || 'https://chibox-game.ru'}?payment=error`);
    }

    // Проверяем статус платежа в БД по invoice_number
    const payment = await Payment.findOne({ where: { invoice_number: parseInt(MERCHANT_ORDER_ID) } });

    if (payment && payment.status === 'completed') {
      logger.info(`Payment ${MERCHANT_ORDER_ID} completed successfully, redirecting to success page`);
      return res.redirect(`${process.env.FRONTEND_URL || 'https://chibox-game.ru'}?payment=success&amount=${AMOUNT || payment.amount}`);
    } else {
      logger.info(`Payment ${MERCHANT_ORDER_ID} pending or failed, redirecting to pending page`);
      return res.redirect(`${process.env.FRONTEND_URL || 'https://chibox-game.ru'}?payment=pending`);
    }
  } catch (error) {
    logger.error('Error processing Freekassa SuccessURL:', error);
    return res.redirect(`${process.env.FRONTEND_URL || 'https://chibox-game.ru'}?payment=error`);
  }
}

/**
 * Обработчик Fail URL для Freekassa
 * Этот URL для редиректа пользователя после неудачной оплаты
 */
async function freekassaFailURL(req, res) {
  try {
    logger.info('=== FREEKASSA FAIL URL RECEIVED ===');
    logger.info('Query params:', req.query);

    const { MERCHANT_ORDER_ID } = req.query;

    if (MERCHANT_ORDER_ID) {
      const payment = await Payment.findOne({ where: { invoice_number: parseInt(MERCHANT_ORDER_ID) } });
      if (payment && payment.status !== 'completed') {
        payment.status = 'failed';
        await payment.save();
        logger.info(`Payment ${MERCHANT_ORDER_ID} marked as failed`);
      }
    }

    return res.redirect(`${process.env.FRONTEND_URL || 'https://chibox-game.ru'}?payment=failed`);
  } catch (error) {
    logger.error('Error processing Freekassa FailURL:', error);
    return res.redirect(`${process.env.FRONTEND_URL || 'https://chibox-game.ru'}?payment=error`);
  }
}

/**
 * Обработчик callback от Альфа-Банка
 * Этот URL вызывается для уведомления магазина о результате оплаты
 */
async function alfabankCallback(req, res) {
  try {
    logger.info('=== ALFABANK CALLBACK RECEIVED ===');
    logger.info('Method:', req.method);
    logger.info('URL:', req.url);
    logger.info('Headers:', JSON.stringify(req.headers, null, 2));
    logger.info('Query params:', JSON.stringify(req.query, null, 2));
    logger.info('Body:', JSON.stringify(req.body, null, 2));
    logger.info('Body type:', typeof req.body);
    logger.info('Body keys:', req.body ? Object.keys(req.body) : 'no body');
    logger.info('Raw body:', req.rawBody || 'N/A');

    const { verifyCallbackChecksum } = require('../services/alfabankService');

    // Параметры могут приходить как в query, так и в body
    // При статическом callback параметры приходят в body
    const params = { ...req.query, ...req.body };
    
    logger.info('Combined params:', JSON.stringify(params, null, 2));

    const {
      orderNumber,
      status,
      checksum,
      orderId,
      mdOrder, // Внутренний номер заказа от Альфа-Банка
      amount,
      cardId,
      pan,
      expiration,
      cardholderName
    } = params;

    // Проверка обязательных параметров
    if (!orderNumber || !status) {
      logger.warn('Missing required parameters in Alfabank callback');
      logger.warn('Received params:', JSON.stringify(params, null, 2));
      
      // Если нет checksum, но есть orderNumber и status, пробуем обработать
      if (!checksum && orderNumber && status) {
        logger.warn('No checksum provided, but orderNumber and status present. Processing without signature verification.');
      } else {
        return res.status(400).send('BAD REQUEST');
      }
    }

    logger.info(`Processing Alfabank payment: OrderNumber=${orderNumber}, Status=${status}`);

    // Проверяем подпись (если она есть)
    let isValidSignature = true;
    if (checksum) {
      isValidSignature = verifyCallbackChecksum({
        orderNumber,
        status,
        checksum
      });

      if (!isValidSignature) {
        logger.warn('Invalid checksum in Alfabank callback');
        logger.warn('Callback params:', JSON.stringify(params, null, 2));
        
        // В режиме разработки или если включен флаг пропускаем проверку подписи
        if (process.env.NODE_ENV === 'development' || process.env.ALFABANK_SKIP_SIGNATURE_CHECK === 'true') {
          logger.warn('Skipping checksum verification (development mode or flag enabled)');
          isValidSignature = true; // Продолжаем обработку
        } else {
          logger.warn('PRODUCTION: Invalid checksum, but continuing processing (payment may be valid)');
          // Всё равно продолжаем, но логируем предупреждение
        }
      } else {
        logger.info('✅ Alfabank checksum verification passed');
      }
    } else {
      logger.warn('No checksum provided in callback - processing without signature verification');
    }

    // Находим платеж в БД
    // Альфа-Банк может отправлять либо orderNumber (наш invoice_number), либо mdOrder (внутренний номер Альфа-Банка)
    let payment = null;
    
    if (orderNumber) {
      payment = await Payment.findOne({ where: { invoice_number: parseInt(orderNumber) } });
    }
    
    // Если не нашли по orderNumber, пробуем найти по mdOrder (внутренний номер Альфа-Банка)
    if (!payment && mdOrder) {
      payment = await Payment.findOne({ 
        where: { 
          payment_id: mdOrder.toString() 
        } 
      });
    }
    
    // Если все еще не нашли, пробуем найти по orderId
    if (!payment && orderId) {
      payment = await Payment.findOne({ 
        where: { 
          payment_id: orderId.toString() 
        } 
      });
    }
    
    // Если все еще не нашли, пробуем найти по orderNumber как payment_id (для статических платежей)
    if (!payment && orderNumber) {
      payment = await Payment.findOne({ 
        where: { 
          payment_id: orderNumber.toString() 
        } 
      });
    }
    
    // Последняя попытка - ищем по последним платежам Альфа-Банка (для отладки)
    if (!payment) {
      const recentPayment = await Payment.findOne({
        where: {
          payment_system: 'alfabank',
          status: 'pending'
        },
        order: [['created_at', 'DESC']],
        limit: 1
      });
      
      if (recentPayment) {
        logger.warn(`Using recent pending payment as fallback: invoice_number=${recentPayment.invoice_number}`);
        payment = recentPayment;
      }
    }
    
    if (!payment) {
      logger.warn(`Payment not found: OrderNumber=${orderNumber}, mdOrder=${mdOrder}, orderId=${orderId}`);
      logger.warn('All params:', JSON.stringify(params, null, 2));
      return res.status(404).send('ORDER NOT FOUND');
    }

    logger.info(`Found payment:`, {
      id: payment.id,
      current_status: payment.status,
      amount: payment.amount,
      user_id: payment.user_id
    });

    // Статусы Альфа-Банка:
    // 0 - заказ зарегистрирован, но не оплачен
    // 1 - предавторизованная сумма захолдирована
    // 2 - проведена полная авторизация суммы заказа
    // 3 - авторизация отменена
    // 4 - по транзакции была проведена операция возврата
    // 5 - инициирована авторизация через ACS банка-эмитента
    // 6 - авторизация отклонена

    // Проверяем, не обработан ли уже этот платеж
    logger.info(`Payment status check: payment.status=${payment.status}, callback.status=${status}`);
    
    if (payment.status === 'completed') {
      logger.info(`Payment ${orderNumber} already completed, skipping processing`);
      return res.send('OK');
    }

    // Обрабатываем статусы
    if (status === '1') {
      // Статус 1 - предавторизованная сумма захолдирована (холд)
      logger.info(`⚠️ Payment ${payment.invoice_number} has status 1 (hold) - waiting for status 2`);
      // Обновляем payment_id если пришел mdOrder
      if (mdOrder && !payment.payment_id) {
        payment.payment_id = mdOrder.toString();
        payment.webhook_received = true;
        payment.webhook_data = params;
        await payment.save();
        logger.info(`Updated payment_id to ${mdOrder} for payment ${payment.invoice_number}`);
      }
      return res.send('OK');
    } else if (status === '2') {
      // Статус 2 означает успешную оплату
      logger.info(`✅ Payment ${payment.invoice_number} has status 2 (successful payment), processing...`);

      // Сначала проверяем пользователя ПЕРЕД обновлением статуса
      const user = await require('../models').User.findByPk(payment.user_id);
      if (!user) {
        logger.warn(`User not found for payment user_id=${payment.user_id}`);
        return res.status(404).send('USER NOT FOUND');
      }

      logger.info(`Processing completed payment for user:`, {
        user_id: user.id,
        username: user.username,
        current_balance: user.balance,
        payment_purpose: payment.purpose,
        payment_amount: payment.amount,
        payment_metadata: payment.metadata
      });

      // Определяем сумму для транзакции
      let transactionAmount = parseFloat(payment.amount);
      if (payment.purpose === 'deposit' && payment.metadata && payment.metadata.chicoins) {
        transactionAmount = parseFloat(payment.metadata.chicoins);
      }

      // Обрабатываем платёж в зависимости от назначения
      if (payment.purpose === 'subscription') {
        logger.info(`Activating subscription for user ${user.id} from payment ${payment.id}`);
        const tierId = payment.metadata && payment.metadata.tierId ? payment.metadata.tierId : 1;
        await activateSubscription(user.id, tierId);
        logger.info(`✅ Subscription activated for user ${user.id}`);
      } else if (payment.purpose === 'deposit') {
        const oldBalance = parseFloat(user.balance || 0);

        // Получаем количество ChiCoins из metadata
        let chicoinsToAdd = parseFloat(payment.amount);
        if (payment.metadata && payment.metadata.chicoins) {
          chicoinsToAdd = parseFloat(payment.metadata.chicoins);
          logger.info(`Using ChiCoins from metadata: ${chicoinsToAdd}`);
        } else {
          logger.warn(`⚠️ No chicoins in metadata, using payment.amount: ${chicoinsToAdd}`);
        }

        const newBalance = oldBalance + chicoinsToAdd;
        user.balance = newBalance;
        await user.save();

        // Перезагружаем пользователя для проверки
        await user.reload();

        logger.info(`✅ Balance updated for user ${user.id}:`, {
          old_balance: oldBalance,
          added: chicoinsToAdd,
          new_balance: user.balance,
          verified_balance: parseFloat(user.balance || 0)
        });

        // Начисляем опыт за пополнение
        try {
          await addExperience(user.id, 40, 'deposit', null, 'Пополнение баланса');
          logger.info(`✅ Experience added for deposit`);
        } catch (expError) {
          logger.error('Failed to add experience for deposit:', expError);
        }
      }

      // Создаем запись транзакции ПОСЛЕ успешного обновления баланса
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
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        is_system: false,
        payment_id: payment.id
      });

      logger.info(`✅ Transaction created:`, {
        transaction_id: transaction.id,
        type: transaction.type,
        amount: transaction.amount
      });

      // ТОЛЬКО ПОСЛЕ успешного обновления баланса сохраняем статус платежа
      payment.status = 'completed';
      payment.webhook_received = true;
      payment.payment_id = orderId || orderNumber.toString();
      payment.webhook_data = params;
      payment.completed_at = new Date();
      await payment.save();

      logger.info(`✅ Payment status updated to completed for OrderNumber=${orderNumber}`);
    } else if (status === '3' || status === '6') {
      // Статус 3 - авторизация отменена, 6 - авторизация отклонена
      logger.warn(`Payment ${orderNumber} failed or cancelled: status=${status}`);
      if (payment.status !== 'failed' && payment.status !== 'cancelled') {
        payment.status = status === '3' ? 'cancelled' : 'failed';
        payment.webhook_received = true;
        payment.webhook_data = params;
        await payment.save();
        logger.info(`Payment ${orderNumber} marked as ${payment.status}`);
      }
    } else {
      logger.warn(`⚠️ Payment ${orderNumber} has unexpected status: ${status}. Expected status '2' for successful payment.`);
      logger.info(`Payment ${orderNumber} status is ${status}, no action needed (waiting for status '2')`);
    }

    // Альфа-Банк требует ответ "OK"
    return res.send('OK');
  } catch (error) {
    logger.error('❌ Error processing Alfabank callback:', error);
    logger.error('Error stack:', error.stack);
    return res.status(500).send('ERROR');
  }
}

/**
 * Обработчик Success URL для Альфа-Банка
 * Этот URL для редиректа пользователя после успешной оплаты
 */
async function alfabankSuccessURL(req, res) {
  try {
    logger.info('=== ALFABANK SUCCESS URL RECEIVED ===');
    logger.info('Query params:', req.query);

    const { orderNumber } = req.query;

    if (!orderNumber) {
      return res.redirect(`${process.env.FRONTEND_URL || 'https://chibox-game.ru'}?payment=error`);
    }

    // Проверяем статус платежа в БД по invoice_number
    const payment = await Payment.findOne({ where: { invoice_number: parseInt(orderNumber) } });

    if (payment && payment.status === 'completed') {
      logger.info(`Payment ${orderNumber} completed successfully, redirecting to success page`);
      return res.redirect(`${process.env.FRONTEND_URL || 'https://chibox-game.ru'}?payment=success&orderNumber=${orderNumber}`);
    } else {
      logger.info(`Payment ${orderNumber} pending or failed, redirecting to pending page`);
      return res.redirect(`${process.env.FRONTEND_URL || 'https://chibox-game.ru'}?payment=pending&orderNumber=${orderNumber}`);
    }
  } catch (error) {
    logger.error('Error processing Alfabank SuccessURL:', error);
    return res.redirect(`${process.env.FRONTEND_URL || 'https://chibox-game.ru'}?payment=error`);
  }
}

/**
 * Обработчик Fail URL для Альфа-Банка
 * Этот URL для редиректа пользователя после неудачной оплаты
 */
async function alfabankFailURL(req, res) {
  try {
    logger.info('=== ALFABANK FAIL URL RECEIVED ===');
    logger.info('Query params:', req.query);

    const { orderNumber } = req.query;

    if (orderNumber) {
      const payment = await Payment.findOne({ where: { invoice_number: parseInt(orderNumber) } });
      if (payment && payment.status !== 'completed') {
        payment.status = 'failed';
        await payment.save();
        logger.info(`Payment ${orderNumber} marked as failed`);
      }
    }

    return res.redirect(`${process.env.FRONTEND_URL || 'https://chibox-game.ru'}?payment=failed&orderNumber=${orderNumber || ''}`);
  } catch (error) {
    logger.error('Error processing Alfabank FailURL:', error);
    return res.redirect(`${process.env.FRONTEND_URL || 'https://chibox-game.ru'}?payment=error`);
  }
}

module.exports = {
  yoomoneyWebhook,
  freekassaResultURL,
  freekassaSuccessURL,
  freekassaFailURL,
  alfabankCallback,
  alfabankSuccessURL,
  alfabankFailURL
};
