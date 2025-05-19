const db = require('../models');
const winston = require('winston');
const { Op } = require('sequelize');
const BuffService = require('./buffService');
const SteamBot = require('./steamBotService');
const config = require('../config/config');

// Создаем логгер
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'withdrawal-service.log' })
  ],
});

// Загружаем конфигурацию BUFF
const buffConfig = BuffService.loadConfig();
const buffService = new BuffService(buffConfig);

// Создаем экземпляр Steam бота (предполагается, что данные импортируются из конфига)
const steamBot = new SteamBot(
  config.steamBot.accountName,
  config.steamBot.password,
  config.steamBot.sharedSecret,
  config.steamBot.identitySecret
);

class WithdrawalService {
  constructor() {
    // Максимальное количество попыток обработки заявки
    this.maxProcessingAttempts = 3;

    // Задержка между попытками в миллисекундах (1 час)
    this.retryDelay = 60 * 60 * 1000;

    // Максимальное количество одновременно обрабатываемых заявок
    this.maxConcurrentProcessing = 5;
  }

  // Получение списка заявок, ожидающих обработку
  async getPendingWithdrawals() {
    try {
      const pendingWithdrawals = await db.Withdrawal.findAll({
        where: {
          status: {
            [Op.in]: ['pending', 'queued']
          },
          processing_attempts: {
            [Op.lt]: this.maxProcessingAttempts
          },
          is_automatic: true,
          next_attempt_date: {
            [Op.or]: [
              { [Op.lte]: new Date() },
              { [Op.is]: null }
            ]
          }
        },
        order: [
          ['priority', 'DESC'],
          ['request_date', 'ASC']
        ],
        limit: this.maxConcurrentProcessing,
        include: [
          {
            model: db.User,
            as: 'user',
            attributes: ['id', 'username', 'steam_trade_url']
          },
          {
            model: db.UserInventory,
            as: 'items',
            include: [
              {
                model: db.Item,
                as: 'item'
              }
            ]
          }
        ]
      });

      logger.info(`Найдено ${pendingWithdrawals.length} заявок на вывод, ожидающих обработки`);
      return pendingWithdrawals;
    } catch (error) {
      logger.error('Ошибка при получении списка заявок на вывод:', error);
      throw error;
    }
  }

  // Обработка заявки на вывод
  async processWithdrawal(withdrawal) {
    logger.info(`Начало обработки заявки на вывод #${withdrawal.id}...`);

    try {
      // Обновляем статус и данные о попытке обработки
      await withdrawal.update({
        status: 'processing',
        processing_date: new Date(),
        processing_attempts: withdrawal.processing_attempts + 1,
        last_attempt_date: new Date()
      });

      // Проверяем трейд-ссылку пользователя
      const tradeUrl = withdrawal.steam_trade_url || withdrawal.user.steam_trade_url;
      if (!tradeUrl) {
        logger.error(`Отсутствует trade URL для заявки #${withdrawal.id}`);
        await this.failWithdrawal(withdrawal, 'Отсутствует торговая ссылка Steam');
        return;
      }

      // Получаем информацию о предмете для вывода
      const userInventoryItem = withdrawal.items[0]; // Предполагаем, что у заявки есть хотя бы один предмет
      if (!userInventoryItem) {
        logger.error(`Не найдены предметы для вывода в заявке #${withdrawal.id}`);
        await this.failWithdrawal(withdrawal, 'Не найдены предметы для вывода');
        return;
      }

      const item = userInventoryItem.item;
      if (!item) {
        logger.error(`Не найдена информация о предмете для заявки #${withdrawal.id}`);
        await this.failWithdrawal(withdrawal, 'Не найдена информация о предмете');
        return;
      }

      logger.info(`Обработка вывода предмета: ${item.name} (${item.exterior}) для заявки #${withdrawal.id}`);

      // Ищем предмет в инвентаре бота
      const botItem = await steamBot.findItemInInventory(item.steam_market_hash_name, item.exterior);

      if (botItem) {
        // Если предмет уже есть в инвентаре бота, отправляем его напрямую
        logger.info(`Предмет ${item.steam_market_hash_name} уже в инвентаре бота, отправляем...`);
        return await this.sendItemFromBot(withdrawal, botItem, tradeUrl);
      } else {
        // Если предмета нет в инвентаре бота, пытаемся купить его на BUFF
        logger.info(`Предмет ${item.steam_market_hash_name} не найден в инвентаре бота, пытаемся купить на BUFF...`);
        return await this.buyItemFromBuffAndSend(withdrawal, item, tradeUrl);
      }
    } catch (error) {
      logger.error(`Ошибка при обработке заявки #${withdrawal.id}:`, error);

      // Планируем следующую попытку
      const nextAttemptDate = new Date(Date.now() + this.retryDelay);

      await withdrawal.update({
        status: 'pending',
        next_attempt_date: nextAttemptDate,
        tracking_data: {
          ...withdrawal.tracking_data,
          last_error: error.message,
          last_error_time: new Date().toISOString()
        }
      });

      return false;
    }
  }

  // Отправка предмета напрямую из инвентаря бота
  async sendItemFromBot(withdrawal, botItem, tradeUrl) {
    try {
      // Убеждаемся, что бот залогинен
      if (!steamBot.loggedIn) {
        await steamBot.login();
      }

      // Отправляем трейд
      logger.info(`Отправка предмета ${botItem.market_hash_name} пользователю через трейд...`);
      const tradeResult = await steamBot.sendTradeOffer(
        tradeUrl, // Trade URL пользователя
        [botItem],  // Предметы для отправки
        []          // Предметы для получения (пустой массив)
      );

      logger.info(`Трейд отправлен, ID: ${tradeResult.offerId}, Статус: ${tradeResult.status}`);

      // Обновляем статус заявки
      await withdrawal.update({
        status: 'waiting_confirmation',
        steam_trade_offer_id: tradeResult.offerId,
        steam_trade_status: 'sent',
        tracking_data: {
          ...withdrawal.tracking_data,
          trade_sent: true,
          trade_offer_id: tradeResult.offerId,
          trade_sent_time: new Date().toISOString()
        }
      });

      // Обновляем статус предмета в инвентаре пользователя
      const userInventoryItem = withdrawal.items[0];
      await userInventoryItem.update({
        status: 'withdrawn',
        transaction_date: new Date()
      });

      // Создаем запись в логе транзакций
      await db.Transaction.create({
        user_id: withdrawal.user_id,
        type: 'item_withdrawal',
        amount: 0, // Нет финансовой транзакции
        details: {
          withdrawal_id: withdrawal.id,
          item_id: userInventoryItem.item_id,
          item_name: botItem.market_hash_name,
          trade_offer_id: tradeResult.offerId
        }
      });

      return true;
    } catch (error) {
      logger.error(`Ошибка при отправке предмета из инвентаря бота (заявка #${withdrawal.id}):`, error);
      throw error;
    }
  }

  // Покупка предмета на BUFF и отправка пользователю
  async buyItemFromBuffAndSend(withdrawal, item, tradeUrl) {
    try {
      // Инициализируем BUFF сервис
      await buffService.initialize();
      if (!buffService.isLoggedIn) {
        throw new Error('Не удалось авторизоваться на BUFF');
      }

      // Ищем предмет на BUFF
      const buffItem = await buffService.searchItem(item.steam_market_hash_name, item.exterior);
      if (!buffItem) {
        logger.error(`Предмет ${item.steam_market_hash_name} не найден на BUFF`);
        await this.failWithdrawal(withdrawal, 'Предмет не найден на BUFF');
        return false;
      }

      // Проверяем наличие доступных предложений
      if (!buffItem.items || buffItem.items.length === 0) {
        logger.error(`Нет доступных предложений для ${item.steam_market_hash_name} на BUFF`);
        await this.failWithdrawal(withdrawal, 'Нет доступных предложений на BUFF');
        return false;
      }

      // Берем предложение с минимальной ценой
      const cheapestOffer = buffItem.items[0];
      logger.info(`Найдено предложение на BUFF: ${buffItem.market_hash_name}, Цена: ${cheapestOffer.price}, ID: ${cheapestOffer.id}`);

      // Покупаем предмет
      const purchaseResult = await buffService.buyItem(buffItem.goods_id, cheapestOffer.id, cheapestOffer.price);
      if (!purchaseResult.success) {
        logger.error(`Ошибка покупки предмета на BUFF: ${purchaseResult.message}`);
        await this.failWithdrawal(withdrawal, `Ошибка покупки на BUFF: ${purchaseResult.message}`);
        return false;
      }

      logger.info(`Предмет успешно куплен на BUFF. Bill No: ${purchaseResult.bill_no}`);

      // Обновляем данные о заявке
      await withdrawal.update({
        tracking_data: {
          ...withdrawal.tracking_data,
          buff_purchase: true,
          buff_bill_no: purchaseResult.bill_no,
          purchase_time: new Date().toISOString(),
          purchase_price: cheapestOffer.price
        }
      });

      // Ждем, пока предмет поступит в инвентарь Steam
      // Здесь нужно реализовать механизм периодической проверки инвентаря
      // Поскольку это может занять время, мы должны выйти из текущего процесса
      // и продолжить проверку через другой механизм (например, cron job)

      // Планируем проверку доставки через 10 минут
      const nextCheckTime = new Date(Date.now() + 10 * 60 * 1000);
      await withdrawal.update({
        status: 'processing', // Оставляем в статусе обработки
        next_attempt_date: nextCheckTime,
        tracking_data: {
          ...withdrawal.tracking_data,
          delivery_check_scheduled: true,
          next_check_time: nextCheckTime.toISOString()
        }
      });

      return true;
    } catch (error) {
      logger.error(`Ошибка при покупке предмета на BUFF (заявка #${withdrawal.id}):`, error);
      throw error;
    }
  }

  // Проверка статуса доставки предмета с BUFF
  async checkItemDeliveryStatus(withdrawal) {
    try {
      if (!withdrawal.tracking_data || !withdrawal.tracking_data.buff_bill_no) {
        logger.error(`Нет данных о покупке на BUFF для заявки #${withdrawal.id}`);
        return false;
      }

      const billNo = withdrawal.tracking_data.buff_bill_no;

      // Инициализируем BUFF сервис
      await buffService.initialize();

      // Проверяем статус доставки
      const deliveryStatus = await buffService.checkItemDeliveryStatus(billNo);

      if (!deliveryStatus.success) {
        logger.error(`Ошибка при проверке статуса доставки для Bill No ${billNo}`);
        return false;
      }

      logger.info(`Статус доставки для Bill No ${billNo}: ${deliveryStatus.status}`);

      // Если предмет уже доставлен в Steam
      if (deliveryStatus.status === 'DELIVERED' || deliveryStatus.status === 'COMPLETED') {
        // Обновляем данные заявки
        await withdrawal.update({
          tracking_data: {
            ...withdrawal.tracking_data,
            delivery_status: deliveryStatus.status,
            delivery_completed: true,
            delivery_time: new Date().toISOString()
          }
        });

        // Получаем обновленный инвентарь бота
        const inventory = await steamBot.getInventory(730, 2, true);

        // Ищем предмет по инвентарю
        const userInventoryItem = withdrawal.items[0];
        const item = userInventoryItem.item;

        // Пытаемся найти предмет в инвентаре
        const botItem = inventory.find(invItem =>
          invItem.market_hash_name === item.steam_market_hash_name
        );

        if (botItem) {
          logger.info(`Предмет ${item.steam_market_hash_name} найден в инвентаре бота, отправляем пользователю...`);

          // Получаем trade_url из заявки или из профиля пользователя
          const tradeUrl = withdrawal.steam_trade_url || withdrawal.user.steam_trade_url;

          // Отправляем предмет пользователю
          return await this.sendItemFromBot(withdrawal, botItem, tradeUrl);
        } else {
          logger.warn(`Предмет ${item.steam_market_hash_name} не найден в инвентаре бота после доставки с BUFF`);

          // Планируем еще одну проверку через 10 минут
          const nextCheckTime = new Date(Date.now() + 10 * 60 * 1000);
          await withdrawal.update({
            next_attempt_date: nextCheckTime,
            tracking_data: {
              ...withdrawal.tracking_data,
              inventory_check_failed: true,
              next_check_time: nextCheckTime.toISOString()
            }
          });

          return false;
        }
      } else if (deliveryStatus.status === 'FAILED' || deliveryStatus.status === 'CANCELLED') {
        // Если доставка не удалась
        logger.error(`Доставка не удалась для Bill No ${billNo}: ${deliveryStatus.status}`);
        await this.failWithdrawal(withdrawal, `Ошибка доставки с BUFF: ${deliveryStatus.status}`);
        return false;
      } else {
        // Если предмет еще в процессе доставки
        logger.info(`Предмет всё еще в процессе доставки для Bill No ${billNo}: ${deliveryStatus.status}`);

        // Планируем следующую проверку через 10 минут
        const nextCheckTime = new Date(Date.now() + 10 * 60 * 1000);
        await withdrawal.update({
          next_attempt_date: nextCheckTime,
          tracking_data: {
            ...withdrawal.tracking_data,
            delivery_status: deliveryStatus.status,
            next_check_time: nextCheckTime.toISOString()
          }
        });

        return false;
      }
    } catch (error) {
      logger.error(`Ошибка при проверке статуса доставки предмета (заявка #${withdrawal.id}):`, error);
      throw error;
    }
  }

  // Проверка статуса отправленного трейда
  async checkTradeOfferStatus(withdrawal) {
    try {
      if (!withdrawal.steam_trade_offer_id) {
        logger.error(`Нет данных о трейде для заявки #${withdrawal.id}`);
        return false;
      }

      // Проверяем статус трейда
      const tradeStatus = await steamBot.getTradeOfferStatus(withdrawal.steam_trade_offer_id);

      logger.info(`Статус трейда #${tradeStatus.offerId}: ${tradeStatus.state}`);

      // Обновляем данные о статусе трейда
      await withdrawal.update({
        tracking_data: {
          ...withdrawal.tracking_data,
          trade_status: tradeStatus.state,
          trade_check_time: new Date().toISOString()
        }
      });

      // Проверяем различные статусы трейда
      switch (tradeStatus.state) {
        case 2: // Активен
        case 9: // Ожидает подтверждения другой стороной
          // Трейд всё еще ожидает действий, проверим позже
          const nextCheckTime = new Date(Date.now() + 15 * 60 * 1000); // 15 минут
          await withdrawal.update({
            next_attempt_date: nextCheckTime,
            tracking_data: {
              ...withdrawal.tracking_data,
              next_check_time: nextCheckTime.toISOString()
            }
          });
          return false;

        case 3: // Принят
          // Трейд успешно завершен
          await withdrawal.update({
            status: 'completed',
            completion_date: new Date(),
            steam_trade_status: 'accepted',
            tracking_data: {
              ...withdrawal.tracking_data,
              trade_completed: true,
              completion_time: new Date().toISOString()
            }
          });

          // Добавляем уведомление пользователю о успешном выводе
          await db.Notification.create({
            user_id: withdrawal.user_id,
            type: 'item_withdrawal_completed',
            title: 'Вывод предмета завершен успешно',
            message: `Ваш предмет был успешно выведен в инвентарь Steam.`,
            related_id: withdrawal.id,
            category: 'withdrawal'
          });

          return true;

        case 4: // Истек
        case 5: // Отменен
        case 6: // Отклонен
        case 7: // Неудачен
        case 8: // Нужны дополнительные подтверждения
        case 11: // Email ожидает
          // Трейд завершился с ошибкой
          const statusTexts = {
            4: 'истек срок действия',
            5: 'отменен',
            6: 'отклонен',
            7: 'неудачен',
            8: 'требуются дополнительные подтверждения',
            11: 'ожидает подтверждения по email'
          };

          await this.failWithdrawal(
            withdrawal,
            `Ошибка трейда: ${statusTexts[tradeStatus.state] || 'неизвестная ошибка'}`
          );
          return false;

        default:
          logger.warn(`Неизвестный статус трейда: ${tradeStatus.state}`);
          await this.failWithdrawal(withdrawal, `Неизвестный статус трейда: ${tradeStatus.state}`);
          return false;
      }
    } catch (error) {
      logger.error(`Ошибка при проверке статуса трейда (заявка #${withdrawal.id}):`, error);
      throw error;
    }
  }

  // Пометка заявки как неудачной
  async failWithdrawal(withdrawal, reason) {
    try {
      logger.error(`Заявка #${withdrawal.id} помечена как неудачная: ${reason}`);

      await withdrawal.update({
        status: 'failed',
        completion_date: new Date(),
        failed_reason: reason,
        tracking_data: {
          ...withdrawal.tracking_data,
          failure_reason: reason,
          failure_time: new Date().toISOString()
        }
      });

      // Создаем уведомление для пользователя
      await db.Notification.create({
        user_id: withdrawal.user_id,
        type: 'item_withdrawal_failed',
        title: 'Ошибка вывода предмета',
        message: `К сожалению, вывод вашего предмета не удался: ${reason}. Пожалуйста, попробуйте снова или обратитесь в поддержку.`,
        related_id: withdrawal.id,
        category: 'withdrawal'
      });

      // Возвращаем предмет в инвентарь пользователя
      const userInventoryItem = withdrawal.items[0];
      if (userInventoryItem) {
        await userInventoryItem.update({
          status: 'inventory', // Возвращаем в инвентарь
          withdrawal_id: null,
          transaction_date: null
        });
      }

      return true;
    } catch (error) {
      logger.error(`Ошибка при обработке неудачной заявки #${withdrawal.id}:`, error);
      throw error;
    }
  }

  // Обработка всех ожидающих заявок
  async processAllPendingWithdrawals() {
    try {
      logger.info('Начало обработки заявок на вывод...');

      // Инициализируем подключение к Steam
      if (!steamBot.loggedIn) {
        await steamBot.login();
        if (!steamBot.loggedIn) {
          logger.error('Не удалось выполнить вход в Steam, обработка заявок отменена');
          return;
        }
      }

      // Получаем список заявок
      const pendingWithdrawals = await this.getPendingWithdrawals();

      if (pendingWithdrawals.length === 0) {
        logger.info('Нет заявок, ожидающих обработки');
        return;
      }

      logger.info(`Начало обработки ${pendingWithdrawals.length} заявок...`);

      // Обрабатываем каждую заявку
      for (const withdrawal of pendingWithdrawals) {
        try {
          // Проверяем статус заявки
          if (withdrawal.tracking_data && withdrawal.tracking_data.buff_purchase) {
            // Если предмет был куплен на BUFF, проверяем статус доставки
            await this.checkItemDeliveryStatus(withdrawal);
          } else if (withdrawal.steam_trade_offer_id) {
            // Если трейд уже был отправлен, проверяем его статус
            await this.checkTradeOfferStatus(withdrawal);
          } else {
            // Иначе обрабатываем заявку с начала
            await this.processWithdrawal(withdrawal);
          }
        } catch (error) {
          logger.error(`Ошибка при обработке заявки #${withdrawal.id}:`, error);

          // Обновляем данные о попытке и планируем следующую
          const nextAttemptDate = new Date(Date.now() + this.retryDelay);
          await withdrawal.update({
            status: 'pending',
            next_attempt_date: nextAttemptDate,
            tracking_data: {
              ...withdrawal.tracking_data,
              last_error: error.message,
              last_error_time: new Date().toISOString()
            }
          });
        }
      }

      logger.info('Обработка заявок на вывод завершена');
    } catch (error) {
      logger.error('Ошибка при обработке заявок на вывод:', error);
      throw error;
    } finally {
      // Закрываем сессию BUFF
      if (buffService.page) {
        await buffService.close();
      }
    }
  }
}

module.exports = new WithdrawalService();
