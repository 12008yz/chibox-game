const cron = require('node-cron');
const db = require('../models');
const { giveDailyCaseToUser } = require('../services/caseService');
const { getNextDailyCaseTime } = require('../utils/cronHelper');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.simple()
  ),
  transports: [
    new winston.transports.Console(),
  ],
});

// Schedule the job to run every day at 10:30 UTC (which is 13:30 Moscow time UTC+3)
cron.schedule('42 20 * * *', async () => {
  const now = new Date();
  logger.info(`Starting daily case issuance job at UTC time: ${now.toISOString()}`);

  try {
    // Find all users with active subscriptions
    const users = await db.User.findAll({
      where: {
        subscription_expiry_date: {
          [db.Sequelize.Op.gt]: now
        }
      }
    });

    logger.info(`Found ${users.length} users with active subscriptions`);

    // Вычисляем время следующей выдачи кейсов
    const nextCaseTime = getNextDailyCaseTime();
    logger.info(`Next daily case time will be: ${nextCaseTime.toISOString()}`);

    for (const user of users) {
      try {
        await giveDailyCaseToUser(user.id, user.subscription_tier);

        // Обновляем время следующего доступного кейса
        user.next_case_available_time = nextCaseTime;
        await user.save();

        logger.info(`Issued daily case to user ${user.id} and set next case time`);
      } catch (err) {
        logger.error(`Error issuing daily case to user ${user.id}: ${err.message}`);
      }
    }

    // Также обновляем время для всех пользователей с подписками (включая тех, кто уже получил кейсы ранее)
    try {
      await db.User.update(
        { next_case_available_time: nextCaseTime },
        {
          where: {
            subscription_expiry_date: {
              [db.Sequelize.Op.gt]: now
            }
          }
        }
      );
      logger.info(`Updated next_case_available_time for all users with active subscriptions`);
    } catch (err) {
      logger.error(`Error updating next_case_available_time: ${err.message}`);
    }

    logger.info('Daily case issuance job completed');
  } catch (error) {
    logger.error('Error in daily case issuance job:', error);
  }
});

logger.info('Daily case issuance scheduler started');
