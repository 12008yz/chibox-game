const { Payment, User } = require('../models');
const winston = require('winston');
const { activateSubscription } = require('../services/subscriptionService');
const { addExperience } = require('../services/xpService');

const FRONTEND_BASE = process.env.FRONTEND_URL || 'https://chibox-game.ru';
const redirectToFrontend = (queryString) => `${FRONTEND_BASE}${queryString ? `?${queryString}` : ''}`;

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

/**
 * Обработчик уведомлений Unitpay (CHECK, PAY, ERROR).
 * Unitpay шлёт GET-запросы. Ответ: JSON {"result":{"message":"..."}} или {"error":{"message":"..."}}.
 * Документация: https://help.unitpay.ru/en/payments/payment-handler
 */
async function unitpayHandler(req, res) {
  try {
    logger.info('=== UNITPAY HANDLER RECEIVED ===');
    logger.info('Query:', req.query);

    const {
      verifyHandlerSignature,
      parseParamsFromRequest
    } = require('../services/unitpayService');

    const method = req.query.method;
    const params = parseParamsFromRequest(req);

    if (!method || !params.signature) {
      logger.warn('Unitpay: missing method or params.signature');
      return res.status(400).json({ error: { message: 'Missing method or signature' } });
    }

    const secretKey = process.env.UNITPAY_SECRET_KEY;
    if (!secretKey) {
      logger.error('UNITPAY_SECRET_KEY not set');
      return res.status(500).json({ error: { message: 'Server configuration error' } });
    }

    if (!verifyHandlerSignature(method, params, params.signature, secretKey)) {
      logger.warn('Unitpay: invalid signature');
      return res.status(400).json({ error: { message: 'Invalid signature' } });
    }

    logger.info('Unitpay: signature OK', { method, account: params.account, unitpayId: params.unitpayId, paramsKeys: Object.keys(params) });

    const account = params.account;
    const orderSum = parseFloat(params.orderSum);
    const orderCurrency = (params.orderCurrency || 'RUB').toUpperCase();
    const unitpayId = params.unitpayId;

    const accountNum = parseInt(account, 10);
    if (account == null || account === '' || Number.isNaN(accountNum) || accountNum < 1) {
      logger.info(`Unitpay: invalid or test account=${account}, returning Order not found`);
      return res.status(200).json({ error: { message: 'Order not found' } });
    }

    const payment = await Payment.findOne({
      where: {
        invoice_number: accountNum,
        payment_system: 'unitpay'
      }
    });

    if (!payment) {
      logger.warn(`Unitpay: payment not found for account=${account} (num=${accountNum})`);
      return res.status(200).json({ error: { message: 'Order not found' } });
    }

    if (method === 'check') {
      const expectedSum = parseFloat(payment.amount).toFixed(2);
      const receivedSum = orderSum.toFixed(2);
      if (receivedSum !== expectedSum) {
        logger.warn(`Unitpay CHECK: sum mismatch expected=${expectedSum} received=${receivedSum}`);
        return res.status(200).json({ error: { message: 'Invalid order sum' } });
      }
      if (orderCurrency !== (payment.currency || 'RUB')) {
        return res.status(200).json({ error: { message: 'Invalid currency' } });
      }
      logger.info('Unitpay CHECK: OK');
      return res.status(200).json({ result: { message: 'Request successfully processed' } });
    }

    if (method === 'pay') {
      if (payment.status === 'completed') {
        logger.info(`Unitpay PAY: payment ${account} already completed (idempotent)`);
        return res.status(200).json({ result: { message: 'Request successfully processed' } });
      }

      const user = await User.findByPk(payment.user_id);
      if (!user) {
        logger.warn(`Unitpay: user not found user_id=${payment.user_id}`);
        return res.status(200).json({ error: { message: 'User not found' } });
      }

      let transactionAmount = parseFloat(payment.amount);
      if (payment.purpose === 'deposit' && payment.metadata && payment.metadata.chicoins) {
        transactionAmount = parseFloat(payment.metadata.chicoins);
      }

      if (payment.purpose === 'subscription') {
        const tierId = (payment.metadata && payment.metadata.tierId) ? payment.metadata.tierId : 1;
        await activateSubscription(user.id, tierId);
        logger.info(`Unitpay: subscription activated for user ${user.id}`);
      } else if (payment.purpose === 'deposit') {
        let chicoinsToAdd = transactionAmount;
        if (payment.metadata && payment.metadata.chicoins) {
          chicoinsToAdd = parseFloat(payment.metadata.chicoins);
        }
        user.balance = parseFloat(user.balance || 0) + chicoinsToAdd;
        await user.save();
        try {
          await addExperience(user.id, chicoinsToAdd, 'deposit');
        } catch (e) {
          logger.error('Unitpay: addExperience failed', e);
        }
      }

      const balanceBefore = payment.purpose === 'subscription' ? user.balance : (user.balance - transactionAmount);
      await require('../models').Transaction.create({
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

      payment.status = 'completed';
      payment.webhook_received = true;
      payment.payment_id = unitpayId ? String(unitpayId) : account;
      payment.webhook_data = params;
      payment.completed_at = new Date();
      await payment.save();

      logger.info(`Unitpay PAY: completed for account=${account}`);
      return res.status(200).json({ result: { message: 'Request successfully processed' } });
    }

    if (method === 'error') {
      if (payment.status !== 'completed') {
        payment.status = 'failed';
        await payment.save();
        logger.info(`Unitpay ERROR: payment ${account} marked as failed`);
      }
      return res.status(200).json({ result: { message: 'Request successfully processed' } });
    }

    logger.warn(`Unitpay: unknown method=${method}`);
    return res.status(200).json({ error: { message: 'Unknown method' } });
  } catch (error) {
    logger.error('Unitpay handler error:', error);
    return res.status(500).json({ error: { message: 'Internal error' } });
  }
}

async function unitpaySuccessURL(req, res) {
  try {
    const { account } = req.query;
    if (account) {
      const payment = await Payment.findOne({
        where: { invoice_number: parseInt(account, 10), payment_system: 'unitpay' }
      });
      if (payment && payment.status === 'completed') {
        return res.redirect(redirectToFrontend(`payment=success&amount=${payment.amount}`));
      }
    }
    return res.redirect(redirectToFrontend('payment=pending'));
  } catch (e) {
    logger.error('Unitpay SuccessURL error:', e);
    return res.redirect(redirectToFrontend('payment=error'));
  }
}

async function unitpayFailURL(req, res) {
  try {
    const { account } = req.query;
    if (account) {
      const payment = await Payment.findOne({
        where: { invoice_number: parseInt(account, 10), payment_system: 'unitpay' }
      });
      if (payment && payment.status !== 'completed') {
        payment.status = 'failed';
        await payment.save();
      }
    }
    return res.redirect(redirectToFrontend('payment=failed'));
  } catch (e) {
    logger.error('Unitpay FailURL error:', e);
    return res.redirect(redirectToFrontend('payment=error'));
  }
}

module.exports = {
  unitpayHandler,
  unitpaySuccessURL,
  unitpayFailURL
};
