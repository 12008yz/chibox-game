const db = require('../../models');
const { logger } = require('../../utils/logger');
const { addJob } = require('../../services/queueService');
const { calculateModifiedDropWeights, selectItemWithModifiedWeights, selectItemWithModifiedWeightsAndDuplicateProtection } = require('../../utils/dropWeightCalculator');

async function openCase(req, res) {
  try {
    console.log('req.body:', req.body);
    let caseId = req.body.caseId || req.params.caseId || req.query.caseId;
    const userId = req.user.id;

    // Сначала проверки без транзакции
    const user = await db.User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Пользователь не найден' });
    }

    let userCase;

    if (!caseId) {
      // Если caseId не передан, ищем первый неоткрытый кейс пользователя
      userCase = await db.Case.findOne({
        where: { user_id: userId, is_opened: false },
        order: [['received_date', 'ASC']]
      });
      if (!userCase) {
        console.log('next_case_available_time:', user.next_case_available_time);
        if (user.next_case_available_time && user.next_case_available_time > new Date()) {
          const now = new Date();
          const msRemaining = user.next_case_available_time.getTime() - now.getTime();

          const hours = Math.floor(msRemaining / (1000 * 60 * 60));
          const minutes = Math.floor((msRemaining % (1000 * 60 * 60)) / (1000 * 60));
          const seconds = Math.floor((msRemaining % (1000 * 60)) / 1000);

          const timeString = `${hours}ч ${minutes}м ${seconds}с`;

          return res.status(404).json({ success: false, message: `Не найден неоткрытый кейс для пользователя. Следующий кейс будет доступен через ${timeString}`, next_case_available_time: user.next_case_available_time });
        }
        // Если next_case_available_time не установлен, установим его на 1 час вперед
        const newNextCaseTime = new Date(new Date().getTime() + 60 * 60 * 1000);
        user.next_case_available_time = newNextCaseTime;
        await user.save();

        return res.status(404).json({ success: false, message: `Не найден неоткрытый кейс для пользователя. Следующий кейс будет доступен через 1ч 0м 0с`, next_case_available_time: newNextCaseTime });
      }
      caseId = userCase.id;
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (!user.last_reset_date || user.last_reset_date < today) {
      user.cases_opened_today = 0;
      user.last_reset_date = today;
      await user.save();
    }

    // Новые лимиты: общий лимит открытия кейсов
    // Подписочные кейсы: max_daily_cases (1 для любой подписки)
    // Покупные кейсы: без лимита открытия (лимит только на покупку - 5 в день)
    // Общий лимит остается для подписочных кейсов
    const totalCasesLimit = (user.max_daily_cases || 0) + 50; // Подписочные + высокий лимит для покупных

    if (user.cases_opened_today >= totalCasesLimit) {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const msRemaining = tomorrow.getTime() - now.getTime();

      const hours = Math.floor(msRemaining / (1000 * 60 * 60));
      const minutes = Math.floor((msRemaining % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((msRemaining % (1000 * 60)) / 1000);

      const timeString = `${hours}ч ${minutes}м ${seconds}с`;

      return res.status(400).json({ message: `Достигнут общий лимит открытия кейсов на сегодня. Следующий кейс будет доступен через ${timeString}` });
    }

    // Получаем информацию о кейсе для дальнейших проверок
    if (!userCase) {
      userCase = await db.Case.findOne({
        where: { id: caseId, user_id: userId, is_opened: false }
      });
      if (!userCase) {
        return res.status(404).json({ success: false, message: 'Кейс не найден или уже открыт' });
      }
    }

    // Убираем ограничение на время открытия кейса
    // Проверяем ограничение времени открытия кейса только для кейсов из подписки (не купленных)
    if (!userCase.is_paid && user.next_case_available_time && user.next_case_available_time > now) {
      const msRemaining = user.next_case_available_time.getTime() - now.getTime();

      const hours = Math.floor(msRemaining / (1000 * 60 * 60));
      const minutes = Math.floor((msRemaining % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((msRemaining % (1000 * 60)) / 1000);

      const timeString = `${hours}ч ${minutes}м ${seconds}с`;

      return res.status(400).json({ success: false, message: `Следующий кейс будет доступен через ${timeString}`, next_case_available_time: user.next_case_available_time });
    }

    userCase = await db.Case.findOne({
      where: { id: caseId, user_id: userId, is_opened: false },
      include: [
        { model: db.CaseTemplate, as: 'template', include: [{
          model: db.Item,
          as: 'items',
          through: { attributes: [] }
        }] },
        { model: db.Item, as: 'result_item' }
      ]
    });
    if (!userCase) {
      return res.status(404).json({ success: false, message: 'Кейс не найден или уже открыт' });
    }

    const items = userCase.template.items || [];
    if (!items.length) {
      return res.status(404).json({ success: false, message: 'В кейсе нет предметов' });
    }

    // Применяем модифицированные веса с учетом бонусов пользователя
    // Для покупных кейсов (is_paid = true) исключаем бонус от подписки
    let userDropBonus = 0;
    const userSubscriptionTier = user.subscription_tier || 0;

    if (userCase.is_paid) {
      // Покупной кейс: только достижения + уровень (без подписки)
      userDropBonus = (user.achievements_bonus_percentage || 0) + (user.level_bonus_percentage || 0);
      userDropBonus = Math.min(userDropBonus, 15.0); // Общий лимит
    } else {
      // Подписочный кейс: все бонусы
      userDropBonus = user.total_drop_bonus_percentage || 0;
    }

    let selectedItem = null;

    logger.info(`Начинаем выбор предмета. Предметов в кейсе: ${items.length}, userDropBonus: ${userDropBonus}, userSubscriptionTier: ${userSubscriptionTier}, is_paid: ${userCase.is_paid}`);

    // Логируем первые несколько предметов для отладки
    logger.info('Первые 3 предмета в кейсе:', items.slice(0, 3).map(item => ({
      id: item.id,
      name: item.name,
      price: item.price,
      drop_weight: item.drop_weight
    })));

    if (userDropBonus > 0) {
      // Используем модифицированную систему весов
      const modifiedItems = calculateModifiedDropWeights(items, userDropBonus);

      logger.info(`Модифицированных предметов: ${modifiedItems.length}`);

      // Применяем защиту от дубликатов для 3 уровня подписки (только для подписочных кейсов)
      if (!userCase.is_paid && userSubscriptionTier === 3) {
        logger.info('Используем защиту от дубликатов');
        selectedItem = await selectItemWithModifiedWeightsAndDuplicateProtection(
          modifiedItems,
          userId,
          userSubscriptionTier
        );
      } else {
        logger.info('Используем стандартный выбор с модифицированными весами');
        selectedItem = selectItemWithModifiedWeights(modifiedItems);
      }

      
      // Логируем использование бонуса для статистики
      const caseType = userCase.is_paid ? 'покупной' : 'подписочный';
      const duplicateProtection = (!userCase.is_paid && userSubscriptionTier === 3) ? ' и защитой от дубликатов' : '';
      logger.info(`Пользователь ${userId} открывает ${caseType} кейс с бонусом ${userDropBonus.toFixed(2)}%${duplicateProtection}`);
    } else {
      // Стандартная система без бонусов, но с защитой от дубликатов если есть 3 уровень подписки (только для подписочных кейсов)
      if (!userCase.is_paid && userSubscriptionTier === 3) {
        selectedItem = await selectItemWithModifiedWeightsAndDuplicateProtection(
          items,
          userId,
          userSubscriptionTier
        );
      } else {
        const totalWeight = items.reduce((sum, item) => sum + (item.drop_weight || 1), 0);

        if (totalWeight <= 0) {
          logger.error(`Общий вес предметов равен 0 для кейса ${caseId}`);
          selectedItem = items[0]; // Берем первый предмет
        } else {
          let randomWeight = Math.random() * totalWeight;

          for (const item of items) {
            randomWeight -= (item.drop_weight || 1);
            if (randomWeight <= 0) {
              selectedItem = item;
              break;
            }
          }
          if (!selectedItem) {
            selectedItem = items[items.length - 1];
          }
        }
      }
    }

    // Проверяем, что предмет был выбран
    if (!selectedItem) {
      logger.error(`Не удалось выбрать предмет из кейса ${caseId}. Предметы в кейсе:`, items.map(item => ({ id: item.id, name: item.name, drop_weight: item.drop_weight, price: item.price })));
      return res.status(500).json({ message: 'Ошибка выбора предмета из кейса' });
    }

    logger.info(`Выбран предмет: ${selectedItem.id} (${selectedItem.name || 'N/A'}) для пользователя ${userId}`);

    // Транзакция только для критических операций изменения данных
    const { sequelize } = require('../../models');
    const t = await sequelize.transaction();

    try {
      userCase.is_opened = true;
      userCase.opened_date = new Date();
      userCase.result_item_id = selectedItem.id;
      await userCase.save({ transaction: t });

      await db.UserInventory.create({
        user_id: userId,
        item_id: selectedItem.id,
        quantity: 1,
        case_id: userCase.id
      }, { transaction: t });

      // Добавлено создание записи LiveDrop
      await db.LiveDrop.create({
        user_id: userId,
        item_id: selectedItem.id,
        case_id: userCase.id,
        drop_time: new Date(),
        is_rare_item: selectedItem.rarity === 'rare' || selectedItem.rarity === 'legendary',
        item_price: selectedItem.price || null,
        item_rarity: selectedItem.rarity || null,
        user_level: user.level || null,
        user_subscription_tier: user.subscription_tier || null,
        is_highlighted: selectedItem.price && selectedItem.price > 1000, // например, выделять дорогие предметы
        is_hidden: false
      }, { transaction: t });

      user.cases_opened_today += 1;
      await user.save({ transaction: t });

      await t.commit();

    // Добавляем задачи в очереди (асинхронно для лучшей производительности)
    addJob.updateAchievements(userId, {
      achievementType: 'cases_opened',
      value: 1
    }).catch(err => logger.error('Failed to queue achievement update:', err));

    // Начисление опыта за открытие кейса
    addJob.updateAchievements(userId, {
      userId,
      amount: 10,
      reason: 'Открытие кейса'
    }, { jobType: 'add-experience' }).catch(err => logger.error('Failed to queue experience update:', err));

    // Обновление достижений для лучшего предмета
    if (selectedItem.price && selectedItem.price > 0) {
      addJob.updateAchievements(userId, {
        achievementType: 'best_item_value',
        value: selectedItem.price
      }).catch(err => logger.error('Failed to queue achievement update:', err));
    }

      logger.info(`Пользователь ${userId} открыл кейс ${caseId} и получил предмет ${selectedItem.id}`);

      return res.json({ item: selectedItem, message: 'Кейс успешно открыт' });
    } catch (transactionError) {
      await t.rollback();
      throw transactionError;
    }
  } catch (error) {
    logger.error('Ошибка открытия кейса:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = {
  openCase
};
