const db = require('../../models');
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

async function getCases(req, res) {
  try {
    const cases = await db.CaseTemplate.findAll();
    logger.info('Получен список кейсов');
    return res.json({ success: true, cases });
  } catch (error) {
    logger.error('Ошибка получения кейсов:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = {
  getCases
};
