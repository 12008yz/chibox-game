const db = require('../../models');
const { Op } = require('sequelize');
const { logger } = require('../../utils/logger');
const { addJob } = require('../../services/queueService');
const { calculateModifiedDropWeights, selectItemWithModifiedWeights, selectItemWithModifiedWeightsAndDuplicateProtection, selectItemWithFullDuplicateProtection, selectItemWithCorrectWeights, determineCaseType } = require('../../utils/dropWeightCalculator');
const { broadcastDrop } = require('../../services/liveDropService');
const { FREE_CASE_TEMPLATE_ID, checkFreeCaseAvailability, updateFreeCaseCounters } = require('../../utils/freeCaseHelper');
const { updateUserBonuses } = require('../../utils/userBonusCalculator');
// По умолчанию обновляем достижения сразу после открытия кейса. Режим очереди — только при
// CASE_OPEN_INLINE_POST_PROCESSING=false (нужны Redis и scripts/start-workers.js).
const shouldRunInlineCasePostProcessing = process.env.CASE_OPEN_INLINE_POST_PROCESSING !== 'false';
const isCaseDebugEnabled = process.env.DEBUG_CASE_OPEN === 'true';

// Редкости как в models/Item.js (CS2). Значения epic/legendary в БД отсутствуют.
const RARITY_COLLECTOR = ['restricted', 'classified', 'covert', 'contraband', 'exotic'];
const RARITY_EPIC_PLUS = ['classified', 'covert', 'contraband', 'exotic'];
const RARITY_LEGENDARY = ['covert', 'contraband', 'exotic'];

function debugLog(...args) {
  if (isCaseDebugEnabled) {
    logger.info(...args);
  }
}

/**
 * Полная постобработка достижений и XP после успешного открытия кейса (после commit транзакции).
 */
async function runInlineCaseAchievements(userId, selectedItem, user, caseEntityId, experienceDescription) {
  const { updateUserAchievementProgress, updateInventoryRelatedAchievements } = require('../../services/achievementService');
  const { addExperience } = require('../../services/xpService');

  await updateUserAchievementProgress(userId, 'cases_opened', 1);
  debugLog(`Обновлено достижение cases_opened для пользователя ${userId}`);

  try {
    await addExperience(userId, 10, 'case_opening', caseEntityId, experienceDescription);
    debugLog(`Начислен опыт за открытие кейса для пользователя ${userId}`);
  } catch (xpError) {
    logger.error('Ошибка начисления опыта:', xpError);
  }

  if (selectedItem.price && selectedItem.price > 0) {
    await updateUserAchievementProgress(userId, 'best_item_value', selectedItem.price);
    debugLog(`Обновлено достижение best_item_value для пользователя ${userId}: ${selectedItem.price}`);
  }

  const itemRarity = selectedItem.rarity?.toLowerCase();
  if (RARITY_COLLECTOR.includes(itemRarity)) {
    await updateUserAchievementProgress(userId, 'rare_items_found', 1);
    debugLog(`Обновлено достижение rare_items_found для пользователя ${userId}`);
  }

  if (selectedItem.price && parseFloat(selectedItem.price) >= 100) {
    await updateUserAchievementProgress(userId, 'premium_items_found', 1);
    debugLog(`Обновлено достижение premium_items_found для пользователя ${userId}`);
  }

  await updateInventoryRelatedAchievements(userId);
  debugLog(`Обновлены достижения инвентаря для пользователя ${userId}`);

  const openTime = new Date();
  const hours = openTime.getHours();
  if (hours >= 2 && hours < 4) {
    await updateUserAchievementProgress(userId, 'night_case_opened', 1);
    debugLog(`Обновлено достижение night_case_opened для пользователя ${userId}`);
  }

  const totalCasesOpened = user.total_cases_opened || 0;
  if (totalCasesOpened <= 5 && RARITY_EPIC_PLUS.includes(itemRarity)) {
    await updateUserAchievementProgress(userId, 'early_epic_item', 1);
    debugLog(`Обновлено достижение early_epic_item для пользователя ${userId}`);
  }

  if (RARITY_LEGENDARY.includes(itemRarity)) {
    await updateUserAchievementProgress(userId, 'legendary_item_found', 1);
    debugLog(`Обновлено достижение legendary_item_found для пользователя ${userId}`);
  }

  const recentCases = await db.Case.findAll({
    where: {
      user_id: userId,
      is_opened: true
    },
    include: [{
      model: db.Item,
      as: 'result_item',
      attributes: ['rarity']
    }],
    order: [['opened_date', 'DESC']],
    limit: 5
  });

  if (recentCases.length === 5) {
    const allEpicOrBetter = recentCases.every(c => {
      const rarity = c.result_item?.rarity?.toLowerCase();
      return RARITY_EPIC_PLUS.includes(rarity);
    });

    if (allEpicOrBetter) {
      await updateUserAchievementProgress(userId, 'epic_streak', 5);
      debugLog(`Обновлено достижение epic_streak для пользователя ${userId}`);
    }
  }
}

async function openCase(req, res) {
  try {
    debugLog('req.body:', req.body);
    debugLog('req.params:', req.params);
    debugLog('req.query:', req.query);
    let caseId = req.body.caseId || req.body.case_id || req.params.caseId || req.query.caseId;
    debugLog(`DEBUG: Определен caseId=${caseId}`);
    const inventoryItemId = req.body.inventoryItemId;
    const templateId = req.body.template_id;
    const userId = req.user.id;

    // Если указан inventoryItemId, открываем кейс из инвентаря
    if (inventoryItemId) {
      return await openCaseFromInventory(req, res);
    }

    // Если указан template_id, ищем неоткрытый кейс пользователя с данным шаблоном
    if (templateId) {
      debugLog('Ищем кейс по template_id:', templateId);

      // Сначала ищем в таблице Cases
      let templateCase = await db.Case.findOne({
        where: {
          user_id: userId,
          template_id: templateId,
          is_opened: false
        },
        order: [['received_date', 'ASC']]
      });

      if (templateCase) {
        debugLog('Найден кейс в таблице Cases по template_id:', templateCase.id);
        caseId = templateCase.id;
      } else {
        debugLog('Кейс не найден в таблице Cases, ищем в UserInventory...');

        // Если не найден в Cases, ищем в UserInventory (для ежедневных кейсов)
        const now = new Date();
        const inventoryCase = await db.UserInventory.findOne({
          where: {
            user_id: userId,
            case_template_id: templateId,
            item_type: 'case',
            status: 'inventory',
            [Op.or]: [
              { expires_at: null },
              { expires_at: { [Op.gt]: now } }
            ]
          },
          include: [{
            model: db.CaseTemplate,
            as: 'case_template'
          }],
          order: [['acquisition_date', 'ASC']]
        });

        if (inventoryCase) {
          debugLog('Найден кейс в UserInventory по template_id:', inventoryCase.id);
          // Открываем кейс из инвентаря
          return await openCaseFromInventory(req, res, inventoryCase.id);
        } else {
          debugLog('Кейс с template_id не найден ни в Cases, ни в UserInventory. Проверяем возможность автовыдачи:', templateId);

          // Проверяем, является ли это ежедневным кейсом и может ли пользователь его получить
          const caseTemplate = await db.CaseTemplate.findByPk(templateId);
          debugLog('Найден шаблон кейса:', caseTemplate ? {
            id: caseTemplate.id,
            name: caseTemplate.name,
            type: caseTemplate.type,
            min_subscription_tier: caseTemplate.min_subscription_tier,
            is_active: caseTemplate.is_active
          } : 'null');

          // Специальная логика для бесплатного кейса (ID: 11111111-1111-1111-1111-111111111111)
          if (templateId === FREE_CASE_TEMPLATE_ID) {
            debugLog('Это бесплатный кейс для новых пользователей, проверяем доступность');

            const user = await db.User.findByPk(userId);

            // Проверяем и обновляем подписку
            await updateUserBonuses(userId);
            await user.reload();

            const availability = checkFreeCaseAvailability(user);

            debugLog('Проверка доступности бесплатного кейса:', availability);

            if (!availability.canClaim) {
              return res.status(403).json({
                success: false,
                message: availability.reason,
                nextAvailableTime: availability.nextAvailableTime
              });
            }

            debugLog('✓ Пользователь может получить бесплатный кейс, выдаем автоматически...');

            try {
              const { addCaseToInventory } = require('../../services/caseService');
              const now = new Date();

              // Бесплатный кейс не протухает
              const createdCase = await addCaseToInventory(userId, templateId, 'free_case', null);
              debugLog('Бесплатный кейс успешно добавлен в инвентарь:', createdCase.id);

              // Обновляем счетчики бесплатных кейсов
              await updateFreeCaseCounters(user);
              debugLog('Счетчики бесплатных кейсов обновлены. Открыто кейсов:', user.free_case_claim_count);

              // Открываем кейс из инвентаря
              const newInventoryCase = await db.UserInventory.findOne({
                where: {
                  user_id: userId,
                  case_template_id: templateId,
                  item_type: 'case',
                  status: 'inventory'
                },
                include: [{
                  model: db.CaseTemplate,
                  as: 'case_template'
                }],
                order: [['acquisition_date', 'DESC']]
              });

              if (newInventoryCase) {
                debugLog('✓ Автовыданный бесплатный кейс найден, открываем:', newInventoryCase.id);
                return await openCaseFromInventory(req, res, newInventoryCase.id);
              } else {
                console.error('✗ Бесплатный кейс был создан, но не найден при поиске!');
                return res.status(500).json({
                  success: false,
                  message: 'Ошибка при создании бесплатного кейса'
                });
              }
            } catch (autoGiveError) {
              console.error('✗ Ошибка при автовыдаче бесплатного кейса:', autoGiveError);
              console.error('Stack trace:', autoGiveError.stack);
              return res.status(500).json({
                success: false,
                message: 'Ошибка при выдаче бесплатного кейса'
              });
            }
          }

          if (caseTemplate && caseTemplate.type === 'daily') {
            debugLog('Это ежедневный кейс, проверяем права пользователя');

            const user = await db.User.findByPk(userId);

            // Проверяем и обновляем подписку перед проверкой доступа к ежедневному кейсу
            await updateUserBonuses(userId);
            await user.reload();

            debugLog('Данные пользователя:', {
              id: user?.id,
              subscription_tier: user?.subscription_tier,
              subscription_days_left: user?.subscription_days_left,
              subscription_expiry_date: user?.subscription_expiry_date
            });
            debugLog('Требуемый уровень подписки:', caseTemplate.min_subscription_tier);

            if (user && user.subscription_tier >= caseTemplate.min_subscription_tier) {
              debugLog('✓ Пользователь имеет право на этот кейс');

              // ОГРАНИЧЕНИЕ НА ЕЖЕДНЕВНЫЙ ЛИМИТ ОТКЛЮЧЕНО
              // Пользователь может получать кейс сколько угодно раз

              debugLog('Выдаем кейс автоматически...');

              try {
                // Выдаем конкретный ежедневный кейс пользователю
                const { addCaseToInventory } = require('../../services/caseService');

                // Если у пользователя есть активная подписка, кейс не протухает (expires_at = null)
                // Иначе кейс протухает через cooldown_hours
                const expiresAt = (user.subscription_expiry_date && user.subscription_expiry_date > now)
                  ? null
                  : new Date(now.getTime() + caseTemplate.cooldown_hours * 3600000);

                debugLog('Вызываем addCaseToInventory с параметрами:', {
                  userId,
                  templateId,
                  source: 'subscription',
                  expiresAt
                });

                const createdCase = await addCaseToInventory(userId, templateId, 'subscription', expiresAt);
                debugLog('Кейс успешно добавлен в инвентарь:', createdCase.id);

                // Пытаемся найти кейс снова
                debugLog('Ищем только что созданный кейс в инвентаре...');
                const newInventoryCase = await db.UserInventory.findOne({
                  where: {
                    user_id: userId,
                    case_template_id: templateId,
                    item_type: 'case',
                    status: 'inventory',
                    [Op.or]: [
                      { expires_at: null },
                      { expires_at: { [Op.gt]: now } }
                    ]
                  },
                  include: [{
                    model: db.CaseTemplate,
                    as: 'case_template'
                  }],
                  order: [['acquisition_date', 'DESC']] // Берем самый новый
                });

                if (newInventoryCase) {
                  debugLog('✓ Автовыданный кейс найден, открываем:', newInventoryCase.id);
                  return await openCaseFromInventory(req, res, newInventoryCase.id);
                } else {
                  console.error('✗ Кейс был создан, но не найден при поиске!');
                }
              } catch (autoGiveError) {
                console.error('✗ Ошибка при автовыдаче ежедневного кейса:', autoGiveError);
                console.error('Stack trace:', autoGiveError.stack);
              }
            } else {
              debugLog('✗ Пользователь не имеет права на этот кейс. subscription_tier:', user?.subscription_tier, 'required:', caseTemplate.min_subscription_tier);
              return res.status(403).json({
                success: false,
                message: `Для этого кейса требуется статус уровня ${caseTemplate.min_subscription_tier} или выше`
              });
            }
          }

          debugLog('Кейс с template_id не найден и не может быть автовыдан:', templateId);
          return res.status(404).json({
            success: false,
            message: 'Кейс с данным шаблоном не найден или уже открыт'
          });
        }
      }
    }

    // Сначала проверки без транзакции
    const user = await db.User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Пользователь не найден' });
    }

    // Проверяем и обновляем подписку при каждом открытии кейса
    await updateUserBonuses(userId);
    // Перезагружаем пользователя после обновления бонусов
    await user.reload();

    let userCase;

    if (!caseId) {
      // Если caseId не передан, ищем первый неоткрытый кейс пользователя
      userCase = await db.Case.findOne({
        where: { user_id: userId, is_opened: false },
        order: [['received_date', 'ASC']]
      });
      if (!userCase) {
        debugLog('next_case_available_time:', user.next_case_available_time);
        if (user.next_case_available_time && user.next_case_available_time > new Date()) {
          const now = new Date();
          const msRemaining = user.next_case_available_time.getTime() - now.getTime();

          const hours = Math.floor(msRemaining / (1000 * 60 * 60));
          const minutes = Math.floor((msRemaining % (1000 * 60 * 60)) / (1000 * 60));
          const seconds = Math.floor((msRemaining % (1000 * 60)) / 1000);

          const timeString = `${hours}ч ${minutes}м ${seconds}с`;

          return res.status(404).json({ success: false, message: `Не найден неоткрытый кейс для пользователя.` });
        }
        // Если next_case_available_time не установлен, установим его на время следующей выдачи кейсов
        const { getNextDailyCaseTime } = require('../../utils/cronHelper');
        const newNextCaseTime = getNextDailyCaseTime();
        user.next_case_available_time = newNextCaseTime;
        await user.save();

        return res.status(404).json({ success: false, message: `Не найден неоткрытый кейс для пользователя.` });
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

    // if (user.cases_opened_today >= totalCasesLimit) {
    //   const tomorrow = new Date(today);
    //   tomorrow.setDate(tomorrow.getDate() + 1);
    //   const msRemaining = tomorrow.getTime() - now.getTime();

    //   const hours = Math.floor(msRemaining / (1000 * 60 * 60));
    //   const minutes = Math.floor((msRemaining % (1000 * 60 * 60)) / (1000 * 60));
    //   const seconds = Math.floor((msRemaining % (1000 * 60)) / 1000);

    //   const timeString = `${hours}ч ${minutes}м ${seconds}с`;

    //   return res.status(400).json({ message: `Достигнут общий лимит открытия кейсов на сегодня. Следующий кейс будет доступен через ${timeString}` });
    // }

    // Получаем информацию о кейсе для дальнейших проверок
    if (!userCase) {
      userCase = await db.Case.findOne({
        where: { id: caseId, user_id: userId, is_opened: false }
      });
      if (!userCase) {
        return res.status(404).json({ success: false, message: 'Кейс не найден или уже открыт' });
      }
    }

    // ВРЕМЕННЫЕ ОГРАНИЧЕНИЯ НА ОТКРЫТИЕ КЕЙСОВ ОТКЛЮЧЕНЫ
    // Пользователи могут открывать кейсы в любое время

    debugLog(`DEBUG: Поиск кейса с caseId=${caseId} для пользователя ${userId}`);
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
    debugLog(`DEBUG: Найден кейс:`, userCase ? { id: userCase.id, template_id: userCase.template_id, name: userCase.template?.name } : 'null');
    if (!userCase) {
      return res.status(404).json({ success: false, message: 'Кейс не найден или уже открыт' });
    }

    // Проверяем, что шаблон существует
    if (!userCase.template) {
      return res.status(404).json({ success: false, message: 'Шаблон кейса не найден' });
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
      userDropBonus = Math.min(userDropBonus, 12.0); // Общий лимит
    } else {
      // Подписочный кейс: все бонусы
      userDropBonus = user.total_drop_bonus_percentage || 0;
    }

    let selectedItem = null;

    // Определяем тип кейса для правильного расчета весов
    const caseType = determineCaseType(userCase.template, userCase.is_paid);
    debugLog(`Тип кейса определен как: ${caseType}`);

    // Транзакция только для критических операций изменения данных
    const { sequelize } = require('../../models');
    const t = await sequelize.transaction();

    try {
      if (userDropBonus > 0) {
        // Используем модифицированную систему весов с учетом типа кейса
        // Передаем процент как число (например, 15.5 для 15.5%)
        const modifiedItems = calculateModifiedDropWeights(items, userDropBonus, caseType);

        debugLog(`Модифицированных предметов: ${modifiedItems.length}`);

        // Получаем уже выпавшие предметы из этого кейса для данного пользователя (для всех типов кейсов)
        // ВАЖНО: получаем в рамках транзакции для избежания race condition
        const droppedItems = await db.CaseItemDrop.findAll({
          where: {
            user_id: userId,
            case_template_id: userCase.template_id
          },
          attributes: ['item_id'],
          transaction: t
        });
        const droppedItemIds = droppedItems.map(drop => drop.item_id);

        debugLog(`DEBUG: Проверяем дубликаты для кейса ${userCase.template_id} (имя: ${userCase.template?.name})`);
        debugLog(`Пользователь ${userId} уже получал из кейса ${userCase.template_id}: ${droppedItemIds.length} предметов`);

        // Для пользователей Статус++ используем полную защиту от дубликатов ТОЛЬКО для ежедневного кейса Статус++
        if (userSubscriptionTier >= 3 && userCase.template_id === '44444444-4444-4444-4444-444444444444') {
          debugLog('Используем ПОЛНУЮ защиту от дубликатов для пользователя Статус++ в ежедневном кейсе Статус++');
          selectedItem = selectItemWithFullDuplicateProtection(
            modifiedItems,
            droppedItemIds,
            userSubscriptionTier,
            caseType
          );
        } else if (userSubscriptionTier >= 3) {
          debugLog('Используем стандартный выбор с модифицированными весами для пользователя Статус++ (другой кейс)');
          selectedItem = selectItemWithModifiedWeights(modifiedItems, userSubscriptionTier, [], caseType);
        } else if (!userCase.is_paid) {
          // Применяем обычную защиту от дубликатов только для подписочных кейсов обычных пользователей
          debugLog('Используем обычную защиту от дубликатов для подписочного кейса');
          selectedItem = selectItemWithModifiedWeightsAndDuplicateProtection(
            modifiedItems,
            droppedItemIds,
            5, // duplicateProtectionCount
            userSubscriptionTier,
            caseType
          );
        } else {
          debugLog('Используем стандартный выбор с модифицированными весами (покупной кейс)');
          selectedItem = selectItemWithModifiedWeights(modifiedItems, userSubscriptionTier, droppedItemIds, caseType);
        }

        // Логируем использование бонуса для статистики
        const caseType = userCase.is_paid ? 'покупной' : 'подписочный';
        const duplicateProtection = (userSubscriptionTier >= 3 && userCase.template_id === '44444444-4444-4444-4444-444444444444') ?
                                     ' и ПОЛНОЙ защитой от дубликатов' :
                                     !userCase.is_paid ? ' и обычной защитой от дубликатов' : '';
        debugLog(`Пользователь ${userId} открывает ${caseType} кейс с бонусом ${userDropBonus.toFixed(2)}%${duplicateProtection}`);
      } else {
        // Стандартная система без бонусов
        // Для пользователей Статус++ применяем полную защиту от дубликатов ТОЛЬКО для ежедневного кейса Статус++
        if (userSubscriptionTier >= 3 && userCase.template_id === '44444444-4444-4444-4444-444444444444') {
          // Получаем уже выпавшие предметы из этого кейса для данного пользователя
          const droppedItems = await db.CaseItemDrop.findAll({
            where: {
              user_id: userId,
              case_template_id: userCase.template_id
            },
            attributes: ['item_id'],
            transaction: t
          });
          const droppedItemIds = droppedItems.map(drop => drop.item_id);

          debugLog(`Пользователь Статус++ ${userId} уже получал из ежедневного кейса Статус++ ${userCase.template_id}: ${droppedItemIds.length} предметов (без бонусов)`);

          selectedItem = selectItemWithFullDuplicateProtection(
            items,
            droppedItemIds,
            userSubscriptionTier,
            caseType
          );
        } else if (userSubscriptionTier >= 3) {
          debugLog(`Пользователь Статус++ ${userId} открывает другой кейс ${userCase.template_id} (без защиты от дубликатов)`);
          selectedItem = selectItemWithCorrectWeights(items, userSubscriptionTier, [], caseType);
        } else {
          // Используем систему весов без бонусов, но с правильными весами на основе цены
          // Для обычных пользователей получаем исключенные предметы тоже (но не применяем фильтрацию)
          const droppedItems = await db.CaseItemDrop.findAll({
            where: {
              user_id: userId,
              case_template_id: userCase.template_id
            },
            attributes: ['item_id'],
            transaction: t
          });
          const droppedItemIds = droppedItems.map(drop => drop.item_id);

          selectedItem = selectItemWithCorrectWeights(items, userSubscriptionTier, droppedItemIds, caseType);
        }
      }

    // Проверяем, что предмет был выбран
    if (!selectedItem) {
      // Специальная обработка для пользователей Статус++, которые получили все предметы из ежедневного кейса Статус++
      if (userSubscriptionTier >= 3 && userCase.template_id === '44444444-4444-4444-4444-444444444444') {
        debugLog(`Пользователь Статус++ ${userId} получил все возможные предметы из ежедневного кейса Статус++ ${userCase.template_id}`);
        return res.status(400).json({
          success: false,
          message: 'Поздравляем! Вы получили все возможные предметы из этого кейса. Попробуйте другие кейсы!',
          error_code: 'ALL_ITEMS_COLLECTED'
        });
      }

      logger.error(`Не удалось выбрать предмет из кейса ${caseId}. Предметы в кейсе:`, items.map(item => ({ id: item.id, name: item.name, drop_weight: item.drop_weight, price: item.price })));
      return res.status(500).json({ message: 'Ошибка выбора предмета из кейса' });
    }

    // КРИТИЧЕСКИ ВАЖНАЯ ПРОВЕРКА: убеждаемся, что выбранный предмет НЕ в списке исключенных
    // Получаем АКТУАЛЬНЫЕ данные об исключенных предметах прямо перед проверкой
    // ТОЛЬКО для ежедневного кейса Статус++
    if (userSubscriptionTier >= 3 && userCase.template_id === '44444444-4444-4444-4444-444444444444') {
      const actualDroppedItems = await db.CaseItemDrop.findAll({
        where: {
          user_id: userId,
          case_template_id: userCase.template_id
        },
        attributes: ['item_id']
      });
      const actualDroppedItemIds = actualDroppedItems.map(drop => drop.item_id);

      if (actualDroppedItemIds.includes(selectedItem.id)) {
        logger.error(`🚨 КРИТИЧЕСКАЯ ОШИБКА: Выбран исключенный предмет ${selectedItem.id} для пользователя Статус++ ${userId} в ежедневном кейсе Статус++!`);
        logger.error(`Исключенные предметы (актуальные): ${JSON.stringify(actualDroppedItemIds)}`);
        logger.error(`Исключенные предметы (кеш): ${JSON.stringify(actualDroppedItemIds)}`);
        logger.error(`Уровень подписки: ${userSubscriptionTier}`);
        logger.error(`Выбранный предмет: ${JSON.stringify({ id: selectedItem.id, name: selectedItem.name, price: selectedItem.price })}`);
        logger.error(`Функция выбора вернула исключенный предмет - это критический баг!`);

        return res.status(500).json({
          success: false,
          message: 'Критическая ошибка: выбран уже полученный предмет. Обратитесь в поддержку.',
          error_code: 'DUPLICATE_ITEM_SELECTED',
          debug: {
            selected_item_id: selectedItem.id,
            excluded_count_cache: actualDroppedItemIds.length,
            excluded_count_actual: actualDroppedItemIds.length,
            total_items: items.length,
            user_tier: userSubscriptionTier
          }
        });
      }
    }

      debugLog(`✅ Выбран предмет: ${selectedItem.id} (${selectedItem.name || 'N/A'}) для пользователя ${userId}`);

      // Дополнительная проверка для Статус++ в ежедневном кейсе Статус++
      if (userSubscriptionTier >= 3 && userCase.template_id === '44444444-4444-4444-4444-444444444444') {
        debugLog('Статус++ (ежедневный кейс Статус++): выбранный предмет НЕ в списке исключенных');
      }
      userCase.is_opened = true;
      userCase.opened_date = new Date();
      userCase.result_item_id = selectedItem.id;
      await userCase.save({ transaction: t });

      await userCase.reload({ transaction: t });

      // Добавляем предмет в инвентарь
      // Примечание: case_template_id должен быть null для item_type='item' согласно валидации модели
      // Информация о шаблоне кейса доступна через case_id -> Cases.template_id
      await db.UserInventory.create({
        user_id: userId,
        item_id: selectedItem.id,
        source: 'case',
        status: 'inventory',
        case_id: userCase.id,
        item_type: 'item'
      }, { transaction: t });

      // Записываем выпавший предмет для всех пользователей
      try {
        await db.CaseItemDrop.create({
          user_id: userId,
          case_template_id: userCase.template_id,
          item_id: selectedItem.id,
          case_id: userCase.id,
          dropped_at: new Date()
        }, {
          transaction: t,
          ignoreDuplicates: true // Игнорируем дубликаты на случай повторной записи
        });

        debugLog(`Записан выпавший предмет ${selectedItem.id} для пользователя ${userId} из кейса ${userCase.template_id}`);
      } catch (dropError) {
        // Логируем ошибку, но не прерываем транзакцию
        console.error('DEBUG: Ошибка записи выпавшего предмета:', dropError);
        logger.error('Ошибка записи выпавшего предмета:', dropError);
      }

      // Создание записи LiveDrop с проверкой на дубликаты
      const existingDrop = await db.LiveDrop.findOne({
        where: {
          user_id: userId,
          item_id: selectedItem.id,
          case_id: userCase.id
        },
        transaction: t
      });

      let liveDropRecord;
      if (!existingDrop) {
        liveDropRecord = await db.LiveDrop.create({
          user_id: userId,
          item_id: selectedItem.id,
          case_id: userCase.id,
          drop_time: new Date(),
          is_rare_item: selectedItem.rarity === 'rare' || selectedItem.rarity === 'legendary',
          item_price: selectedItem.price || null,
          item_rarity: selectedItem.rarity || null,
          user_level: user.level || null,
          user_subscription_tier: user.subscription_tier || null,
          is_highlighted: selectedItem.price && selectedItem.price > 1000,
          is_hidden: false
        }, { transaction: t });

        debugLog(`LiveDrop запись создана для пользователя ${userId}, предмет ${selectedItem.id}, кейс ${userCase.id}`);
      } else {
        liveDropRecord = existingDrop;
        debugLog(`LiveDrop запись уже существует для пользователя ${userId}, предмет ${selectedItem.id}, кейс ${userCase.id}`);
      }

      // Транслируем живое падение через Socket.IO
      broadcastDrop(user, selectedItem, userCase, {
        id: liveDropRecord.id,
        isRare: liveDropRecord.is_rare_item,
        isHighlighted: liveDropRecord.is_highlighted
      });

      user.cases_opened_today += 1;
      user.total_cases_opened = (user.total_cases_opened || 0) + 1;

      // Обновляем общую стоимость предметов и лучший предмет
      const itemPrice = parseFloat(selectedItem.price) || 0;

      // Обновляем лучший предмет, если текущий дороже (атомарно)
      const currentBestValue = parseFloat(user.best_item_value) || 0;
      debugLog(`DEBUG: Обновление лучшего предмета. Текущий: ${currentBestValue}, Новый: ${itemPrice}, Предмет: ${selectedItem.name}`);

      if (itemPrice > currentBestValue) {
        debugLog(`DEBUG: Новый рекорд! Обновляем best_item_value с ${currentBestValue} на ${itemPrice}`);

        // Используем прямое обновление для надежности
        await db.User.update(
          {
            best_item_value: itemPrice,
            total_items_value: db.Sequelize.literal(`COALESCE(total_items_value, 0) + ${itemPrice}`)
          },
          {
            where: { id: userId },
            transaction: t
          }
        );

        // Обновляем локальную копию пользователя
        user.best_item_value = itemPrice;

        // Перечитываем пользователя из базы для подтверждения
        await user.reload({ transaction: t });
        debugLog(`DEBUG: Подтверждение обновления - best_item_value после reload: ${user.best_item_value}`);
      } else {
        // Все равно обновляем общую стоимость
        user.total_items_value = (parseFloat(user.total_items_value) || 0) + itemPrice;
      }

      // Обновляем next_case_available_time для бесплатных кейсов
      if (!userCase.is_paid) {
        const { getNextDailyCaseTime } = require('../../utils/cronHelper');
        const newNextCaseTime = getNextDailyCaseTime();
        user.next_case_available_time = newNextCaseTime;
        debugLog('Обновляем next_case_available_time для бесплатного кейса:', newNextCaseTime);
      }

      await user.save({ transaction: t });

      await t.commit();

    // Достижения и XP после commit (по умолчанию inline; очередь — только если CASE_OPEN_INLINE_POST_PROCESSING=false).
    if (shouldRunInlineCasePostProcessing) {
      try {
        await runInlineCaseAchievements(userId, selectedItem, user, userCase.id, 'Открытие кейса');
      } catch (achievementError) {
        logger.error('Ошибка обновления достижений:', achievementError);
      }
    } else {
      debugLog(`Inline post-processing отключен для openCase (userId=${userId})`);
    }

    if (!shouldRunInlineCasePostProcessing) {
      addJob.updateAchievements(userId, {
        achievementType: 'cases_opened',
        value: 1
      }).catch(err => logger.error('Failed to queue achievement update:', err));

      addJob.updateAchievements(userId, {
        userId,
        amount: 10,
        reason: 'Открытие кейса'
      }, { jobType: 'add-experience' }).catch(err => logger.error('Failed to queue experience update:', err));

      if (selectedItem.price && selectedItem.price > 0) {
        addJob.updateAchievements(userId, {
          achievementType: 'best_item_value',
          value: selectedItem.price
        }).catch(err => logger.error('Failed to queue achievement update:', err));
      }
    }

      debugLog(`Пользователь ${userId} открыл кейс ${caseId} и получил предмет ${selectedItem.id}`);

      return res.json({
        success: true,
        data: { item: selectedItem },
        message: 'Кейс успешно открыт'
      });
    } catch (transactionError) {
      await t.rollback();
      throw transactionError;
    }
  } catch (error) {
    logger.error('Ошибка открытия кейса:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

async function openCaseFromInventory(req, res, passedInventoryItemId = null) {
  try {
    const inventoryItemId = passedInventoryItemId || req.body.inventoryItemId;
    const userId = req.user.id;

    if (!inventoryItemId) {
      return res.status(400).json({ success: false, message: 'ID предмета в инвентаре не указан' });
    }

    // Получаем пользователя
    const user = await db.User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Пользователь не найден' });
    }

    // Проверяем и обновляем подписку при каждом открытии кейса
    await updateUserBonuses(userId);
    // Перезагружаем пользователя после обновления бонусов
    await user.reload();

    // Находим кейс в инвентаре пользователя
    const inventoryCase = await db.UserInventory.findOne({
      where: {
        id: inventoryItemId,
        user_id: userId,
        item_type: 'case',
        status: 'inventory'
      },
      include: [{
        model: db.CaseTemplate,
        as: 'case_template',
        include: [{
          model: db.Item,
          as: 'items',
          through: { attributes: [] }
        }]
      }]
    });

    if (!inventoryCase) {
      return res.status(404).json({ success: false, message: 'Кейс не найден в инвентаре' });
    }

    debugLog('inventoryCase найден:', {
      id: inventoryCase.id,
      case_template_id: inventoryCase.case_template_id,
      case_template: !!inventoryCase.case_template,
      case_template_name: inventoryCase.case_template?.name
    });

    // Проверяем, что шаблон кейса существует
    if (!inventoryCase.case_template) {
      console.error('Шаблон кейса не найден для case_template_id:', inventoryCase.case_template_id);
      return res.status(404).json({ success: false, message: 'Шаблон кейса не найден' });
    }

    // Проверяем срок действия кейса
    if (inventoryCase.expires_at && inventoryCase.expires_at < new Date()) {
      return res.status(400).json({ success: false, message: 'Срок действия кейса истек' });
    }

    const items = inventoryCase.case_template.items || [];
    debugLog('Найдено предметов в кейсе:', items.length);

    if (!items.length) {
      console.error('В кейсе нет предметов. case_template_id:', inventoryCase.case_template_id, 'case_template.name:', inventoryCase.case_template.name);
      return res.status(404).json({ success: false, message: 'В кейсе нет предметов' });
    }

    // Вычисляем бонусы пользователя
    let userDropBonus = 0;
    const userSubscriptionTier = user.subscription_tier || 0;

    // Для кейсов из инвентаря применяем все бонусы
    userDropBonus = user.total_drop_bonus_percentage || 0;

    let selectedItem = null;

    debugLog(`Открытие кейса из инвентаря. Предметов в кейсе: ${items.length}, userDropBonus: ${userDropBonus}%, userSubscriptionTier: ${userSubscriptionTier}`);
    debugLog(`Бонусы пользователя для инвентарного кейса: итого=${user.total_drop_bonus_percentage || 0}%`);

    // Ограничиваем стоимость предметов для "Бонусного кейса" до 50 ChiCoins согласно анализу экономики
    let filteredItems = items;
    if (inventoryCase.case_template.name === 'Бонусный кейс') {
      filteredItems = items.filter(item => {
        const price = parseFloat(item.price) || 0;
        return price <= 50;
      });
      debugLog(`Бонусный кейс: отфильтровано предметов по цене ≤50 ChiCoins: ${items.length} -> ${filteredItems.length}`);

      if (filteredItems.length === 0) {
        logger.warn('Бонусный кейс: нет предметов стоимостью ≤50 ChiCoins, используем все предметы');
        filteredItems = items;
      }
    }

    // Транзакция для изменения данных
    const { sequelize } = require('../../models');
    const t = await sequelize.transaction();

    try {
      // Получаем уже выпавшие предметы из этого кейса для данного пользователя
      // ВАЖНО: получаем в рамках транзакции для избежания race condition
      const droppedItems = await db.CaseItemDrop.findAll({
        where: {
          user_id: userId,
          case_template_id: inventoryCase.case_template_id
        },
        attributes: ['item_id'],
        transaction: t
      });
      const droppedItemIds = droppedItems.map(drop => drop.item_id);

      debugLog(`Пользователь ${userId} уже получал из кейса ${inventoryCase.case_template_id}: ${droppedItemIds.length} предметов (инвентарный кейс)`);

      // Определяем тип кейса для правильного расчета весов
      const caseType = determineCaseType(inventoryCase.case_template, false);
      debugLog(`Тип инвентарного кейса определен как: ${caseType}`);

      if (userDropBonus > 0) {
        // Используем модифицированную систему весов
        const modifiedItems = calculateModifiedDropWeights(filteredItems, userDropBonus, caseType);

        // Для пользователей Статус++ используем полную защиту от дубликатов ТОЛЬКО для ежедневного кейса Статус++
        if (userSubscriptionTier >= 3 && inventoryCase.case_template_id === '44444444-4444-4444-4444-444444444444') {
          debugLog('Используем ПОЛНУЮ защиту от дубликатов для пользователя Статус++ в ежедневном кейсе Статус++ (инвентарный кейс)');
          selectedItem = selectItemWithFullDuplicateProtection(
            modifiedItems,
            droppedItemIds,
            userSubscriptionTier,
            caseType
          );
        } else if (userSubscriptionTier >= 3) {
          debugLog('Используем стандартный выбор с модифицированными весами для пользователя Статус++ (другой инвентарный кейс)');
          selectedItem = selectItemWithModifiedWeights(modifiedItems, userSubscriptionTier, [], caseType);
        } else {
          debugLog('Используем обычную защиту от дубликатов для кейса из инвентаря');
          selectedItem = selectItemWithModifiedWeightsAndDuplicateProtection(
            modifiedItems,
            droppedItemIds,
            5, // duplicateProtectionCount
            userSubscriptionTier,
            caseType
          );
        }
      } else {
        // Стандартная система без бонусов
        // Для пользователей Статус++ применяем полную защиту от дубликатов ТОЛЬКО для ежедневного кейса Статус++
        if (userSubscriptionTier >= 3 && inventoryCase.case_template_id === '44444444-4444-4444-4444-444444444444') {
          debugLog(`Пользователь Статус++ ${userId} уже получал из ежедневного кейса Статус++ ${inventoryCase.case_template_id}: ${droppedItemIds.length} предметов (инвентарный кейс, без бонусов)`);
          selectedItem = selectItemWithFullDuplicateProtection(
            filteredItems,
            droppedItemIds,
            userSubscriptionTier,
            caseType
          );
        } else if (userSubscriptionTier >= 3) {
          debugLog(`Пользователь Статус++ ${userId} открывает другой инвентарный кейс ${inventoryCase.case_template_id} (без защиты от дубликатов)`);
          selectedItem = selectItemWithCorrectWeights(filteredItems, userSubscriptionTier, [], caseType);
        } else {
          debugLog(`Пользователь ${userId} уже получал из кейса ${inventoryCase.case_template_id}: ${droppedItemIds.length} предметов (инвентарный кейс, без бонусов)`);
          selectedItem = selectItemWithModifiedWeightsAndDuplicateProtection(
            filteredItems,
            droppedItemIds,
            droppedItemIds.length,
            0,
            caseType
          );
        }
      }

    // Проверяем, что предмет был выбран
    if (!selectedItem) {
      // Специальная обработка для пользователей Статус++, которые получили все предметы из ежедневного кейса Статус++
      if (userSubscriptionTier >= 3 && inventoryCase.case_template_id === '44444444-4444-4444-4444-444444444444') {
        debugLog(`Пользователь Статус++ ${userId} получил все возможные предметы из ежедневного кейса Статус++ ${inventoryCase.case_template_id} (инвентарный)`);
        return res.status(400).json({
          success: false,
          message: 'Поздравляем! Вы получили все возможные предметы из этого кейса. Попробуйте другие кейсы!',
          error_code: 'ALL_ITEMS_COLLECTED'
        });
      }

      logger.error(`Не удалось выбрать предмет из кейса ${inventoryItemId}`);
      return res.status(500).json({ message: 'Ошибка выбора предмета из кейса' });
    }

      debugLog(`Выбран предмет: ${selectedItem.id} (${selectedItem.name || 'N/A'}) из кейса в инвентаре для пользователя ${userId}`);
      // Создаем случайный Case для совместимости с существующей системой
      const newCase = await db.Case.create({
        name: inventoryCase.case_template.name,
        description: inventoryCase.case_template.description,
        image_url: inventoryCase.case_template.image_url,
        template_id: inventoryCase.case_template_id,
        user_id: userId,
        is_opened: true,
        opened_date: new Date(),
        result_item_id: selectedItem.id,
        subscription_tier: userSubscriptionTier,
        drop_bonus_applied: userDropBonus,
        is_paid: true,
        source: 'purchase',
        received_date: inventoryCase.acquisition_date
      }, { transaction: t });

      // Добавляем предмет в инвентарь
      // Примечание: case_template_id должен быть null для item_type='item' согласно валидации модели
      // Информация о шаблоне кейса доступна через case_id -> Cases.template_id
      await db.UserInventory.create({
        user_id: userId,
        item_id: selectedItem.id,
        source: 'case',
        status: 'inventory',
        case_id: newCase.id,
        item_type: 'item'
      }, { transaction: t });

      // Записываем выпавший предмет для всех пользователей
      try {
        await db.CaseItemDrop.create({
          user_id: userId,
          case_template_id: inventoryCase.case_template_id,
          item_id: selectedItem.id,
          case_id: newCase.id,
          dropped_at: new Date()
        }, {
          transaction: t,
          ignoreDuplicates: true // Игнорируем дубликаты на случай повторной записи
        });
        debugLog(`Записан выпавший предмет ${selectedItem.id} для пользователя ${userId} из инвентарного кейса ${inventoryCase.case_template_id}`);
      } catch (dropError) {
        // Логируем ошибку, но не прерываем транзакцию
        logger.error('Ошибка записи выпавшего предмета (инвентарный кейс):', dropError);
      }

      // Удаляем кейс из инвентаря (помечаем как использованный)
      inventoryCase.status = 'used';
      inventoryCase.transaction_date = new Date();
      await inventoryCase.save({ transaction: t });

      // Создаем запись в LiveDrop с проверкой на дубликаты
      const existingDrop = await db.LiveDrop.findOne({
        where: {
          user_id: userId,
          item_id: selectedItem.id,
          case_id: newCase.id
        },
        transaction: t
      });

      let liveDropRecord;
      if (!existingDrop) {
        liveDropRecord = await db.LiveDrop.create({
          user_id: userId,
          item_id: selectedItem.id,
          case_id: newCase.id,
          drop_time: new Date(),
          is_rare_item: selectedItem.rarity === 'rare' || selectedItem.rarity === 'legendary',
          item_price: selectedItem.price || null,
          item_rarity: selectedItem.rarity || null,
          user_level: user.level || null,
          user_subscription_tier: user.subscription_tier || null,
          is_highlighted: selectedItem.price && selectedItem.price > 1000,
          is_hidden: false
        }, { transaction: t });

        debugLog(`LiveDrop запись создана для пользователя ${userId}, предмет ${selectedItem.id}, кейс ${newCase.id} (из инвентаря)`);
      } else {
        liveDropRecord = existingDrop;
        debugLog(`LiveDrop запись уже существует для пользователя ${userId}, предмет ${selectedItem.id}, кейс ${newCase.id} (из инвентаря)`);
      }

      // Транслируем живое падение через Socket.IO
      broadcastDrop(user, selectedItem, newCase, {
        id: liveDropRecord.id,
        isRare: liveDropRecord.is_rare_item,
        isHighlighted: liveDropRecord.is_highlighted
      });

      // Обновляем статистику пользователя. total_cases_opened пишем в БД атомарно,
      // чтобы значение не затиралось при user.reload() в ветке обновления best_item_value.
      await db.User.increment('total_cases_opened', { by: 1, where: { id: userId }, transaction: t });
      user.cases_opened_today = (user.cases_opened_today || 0) + 1;
      user.total_cases_opened = (user.total_cases_opened || 0) + 1;

      // Обновляем общую стоимость предметов и лучший предмет
      const itemPrice = parseFloat(selectedItem.price) || 0;
      const currentBestValue = parseFloat(user.best_item_value) || 0;
      debugLog(`DEBUG: Инвентарный кейс - Обновление лучшего предмета. Текущий: ${currentBestValue}, Новый: ${itemPrice}, Предмет: ${selectedItem.name}`);

      if (itemPrice > currentBestValue) {
        debugLog(`DEBUG: Инвентарный кейс - Новый рекорд! Обновляем best_item_value с ${currentBestValue} на ${itemPrice}`);

        // Используем прямое обновление для надежности
        await db.User.update(
          {
            best_item_value: itemPrice,
            total_items_value: db.Sequelize.literal(`COALESCE(total_items_value, 0) + ${itemPrice}`)
          },
          {
            where: { id: userId },
            transaction: t
          }
        );

        // Обновляем локальную копию пользователя
        user.best_item_value = itemPrice;

        // Перечитываем пользователя из базы для подтверждения
        await user.reload({ transaction: t });
        debugLog(`DEBUG: Инвентарный кейс - Подтверждение обновления - best_item_value после reload: ${user.best_item_value}`);
      } else {
        // Все равно обновляем общую стоимость
        user.total_items_value = (parseFloat(user.total_items_value) || 0) + itemPrice;
      }

      // Обновляем next_case_available_time для бесплатных кейсов из инвентаря
      // Если кейс был получен через подписку или автовыдачу (не покупной)
      if (inventoryCase.source === 'subscription' || inventoryCase.source === 'daily' || !newCase.is_paid) {
        const { getNextDailyCaseTime } = require('../../utils/cronHelper');
        const newNextCaseTime = getNextDailyCaseTime();
        user.next_case_available_time = newNextCaseTime;
        debugLog('Обновляем next_case_available_time для бесплатного кейса из инвентаря:', newNextCaseTime);
      }

      await user.save({ transaction: t });

      await t.commit();

      if (shouldRunInlineCasePostProcessing) {
        try {
          await runInlineCaseAchievements(userId, selectedItem, user, newCase.id, 'Открытие кейса из инвентаря');
        } catch (achievementError) {
          logger.error('Ошибка обновления достижений:', achievementError);
        }
      } else {
        debugLog(`Inline post-processing отключен для openCaseFromInventory (userId=${userId})`);
      }

      if (!shouldRunInlineCasePostProcessing) {
        addJob.updateAchievements(userId, {
          achievementType: 'cases_opened',
          value: 1
        }).catch(err => logger.error('Failed to queue achievement update:', err));

        addJob.updateAchievements(userId, {
          userId,
          amount: 10,
          reason: 'Открытие кейса из инвентаря'
        }, { jobType: 'add-experience' }).catch(err => logger.error('Failed to queue experience update:', err));

        if (selectedItem.price && selectedItem.price > 0) {
          addJob.updateAchievements(userId, {
            achievementType: 'best_item_value',
            value: selectedItem.price
          }).catch(err => logger.error('Failed to queue achievement update:', err));
        }
      }

      debugLog(`Пользователь ${userId} открыл кейс ${inventoryItemId} из инвентаря и получил предмет ${selectedItem.id}`);

      return res.json({
        success: true,
        data: {
          item: selectedItem,
          caseId: newCase.id
        },
        message: 'Кейс успешно открыт из инвентаря'
      });
    } catch (transactionError) {
      await t.rollback();
      throw transactionError;
    }
  } catch (error) {
    logger.error('Ошибка открытия кейса из инвентаря:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = {
  openCase
};
