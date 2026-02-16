const db = require('../models');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
  ],
});

/**
 * Обновляет заявку и инвентарь при успешном/неуспешном завершении вывода.
 * Используется из API checkWithdrawalStatuses и из withdrawal-processor при принятии трейда в Steam.
 *
 * @param {Object} withdrawal - экземпляр модели Withdrawal
 * @param {string} status - 'completed' | 'failed'
 * @param {string} message - сообщение для лога/tracking_data
 */
async function applyWithdrawalOutcome(withdrawal, status, message) {
  const trackingData = withdrawal.tracking_data || {};
  await withdrawal.update({
    status,
    steam_trade_status: status === 'completed' ? 'accepted' : withdrawal.steam_trade_status,
    completion_date: new Date(),
    failed_reason: status === 'failed' ? message : null,
    tracking_data: {
      ...trackingData,
      last_update: new Date().toISOString(),
      message,
    },
  });
  if (status === 'completed') {
    await db.UserInventory.update(
      { status: 'withdrawn', transaction_date: new Date() },
      { where: { withdrawal_id: withdrawal.id, status: 'pending_withdrawal' }, validate: false }
    );
    logger.info(`Статус предметов обновлен на withdrawn для withdrawal ${withdrawal.id}`);
  }
  if (status === 'failed') {
    await db.UserInventory.update(
      { status: 'inventory', withdrawal_id: null, transaction_date: null },
      { where: { withdrawal_id: withdrawal.id, status: 'pending_withdrawal' }, validate: false }
    );
    logger.info(`Предметы возвращены в inventory для failed withdrawal ${withdrawal.id}`);
  }
}

module.exports = {
  applyWithdrawalOutcome,
};
