'use strict';

const db = require('../models');
const { Op } = require('sequelize');
const { logger } = require('../utils/logger');
const { selectItemWithCorrectWeights, determineCaseType } = require('../utils/dropWeightCalculator');
const { broadcastDrop } = require('./liveDropService');

// В development по умолчанию включено, если не задано FAKE_ACTIVITY_ENABLED=false
const FAKE_ACTIVITY_ENABLED = process.env.FAKE_ACTIVITY_ENABLED === 'true' ||
  (process.env.NODE_ENV !== 'production' && process.env.FAKE_ACTIVITY_ENABLED !== 'false');

/**
 * Получить всех ботов (пользователи с is_bot = true)
 */
async function getBots() {
  const users = await db.User.findAll({
    where: { is_bot: true },
    attributes: ['id', 'username', 'level', 'subscription_tier', 'steam_avatar_url', 'avatar_url', 'best_item_value', 'total_cases_opened', 'total_items_value']
  });
  return users;
}

/**
 * Получить случайный активный шаблон кейса с предметами (платные кейсы для разнообразия)
 */
async function getRandomCaseTemplate() {
  const templates = await db.CaseTemplate.findAll({
    where: {
      is_active: true,
      price: { [Op.gt]: 0 },
      id: { [Op.notIn]: [
        '11111111-1111-1111-1111-111111111111', // бесплатный
        '22222222-2222-2222-2222-222222222222',
        '33333333-3333-3333-3333-333333333333',
        '44444444-4444-4444-4444-444444444444',
        '55555555-5555-5555-5555-555555555555'   // бонусный
      ] }
    },
    include: [{
      model: db.Item,
      as: 'items',
      through: { attributes: [] },
      attributes: ['id', 'name', 'price', 'rarity', 'image_url']
    }],
    order: [[db.sequelize.fn('RANDOM')]]
  });

  for (const t of templates) {
    if (t.items && t.items.length > 0) return t;
  }
  return null;
}

/**
 * Симулировать одно открытие кейса для бота (без реального кейса в инвентаре).
 * Создаёт Case, UserInventory, LiveDrop, обновляет User, транслирует в сокет.
 * @param {string} [botId] — если задан, открывает кейс только этому боту; иначе случайный бот (для сида).
 */
async function runFakeCaseOpen(botId = null) {
  if (!FAKE_ACTIVITY_ENABLED) return;

  const t = await db.sequelize.transaction();
  try {
    const bots = await getBots();
    if (!bots.length) {
      await t.rollback();
      return;
    }

    const bot = botId
      ? bots.find((b) => b.id === botId) || bots[Math.floor(Math.random() * bots.length)]
      : bots[Math.floor(Math.random() * bots.length)];

    const template = await getRandomCaseTemplate();
    if (!template || !template.items || template.items.length === 0) {
      await t.rollback();
      return;
    }

    // Приводим предметы к плоским объектам (id, name, price и т.д.) — при include belongToMany поля иначе теряются
    const itemsPlain = template.items.map((it) => {
      const plain = it.get ? it.get({ plain: true }) : it;
      return {
        id: plain.id,
        name: plain.name,
        price: plain.price,
        rarity: plain.rarity,
        image_url: plain.image_url
      };
    }).filter((it) => it.id != null);

    if (!itemsPlain.length) {
      await t.rollback();
      return;
    }

    const user = await db.User.findByPk(bot.id, { transaction: t });
    if (!user) {
      await t.rollback();
      return;
    }

    const caseType = determineCaseType(template, true);
    const selectedItem = selectItemWithCorrectWeights(
      itemsPlain,
      user.subscription_tier || 0,
      [],
      caseType
    );
    if (!selectedItem) {
      await t.rollback();
      return;
    }

    const itemPrice = parseFloat(selectedItem.price) || 0;
    const now = new Date();

    const newCase = await db.Case.create({
      name: template.name,
      description: template.description,
      image_url: template.image_url,
      template_id: template.id,
      user_id: user.id,
      is_opened: true,
      opened_date: now,
      result_item_id: selectedItem.id,
      subscription_tier: user.subscription_tier || 0,
      drop_bonus_applied: user.total_drop_bonus_percentage || 0,
      is_paid: true
    }, { transaction: t });

    await db.UserInventory.create({
      user_id: user.id,
      item_id: selectedItem.id,
      source: 'case',
      status: 'inventory',
      case_id: newCase.id,
      item_type: 'item'
    }, { transaction: t });

    const liveDropRecord = await db.LiveDrop.create({
      user_id: user.id,
      item_id: selectedItem.id,
      case_id: newCase.id,
      drop_time: now,
      is_rare_item: ['rare', 'legendary', 'covert', 'contraband'].includes((selectedItem.rarity || '').toLowerCase()),
      item_price: selectedItem.price,
      item_rarity: selectedItem.rarity,
      user_level: user.level,
      user_subscription_tier: user.subscription_tier,
      is_highlighted: itemPrice > 1000,
      is_hidden: false
    }, { transaction: t });

    try {
      await db.CaseItemDrop.create({
        user_id: user.id,
        case_template_id: template.id,
        item_id: selectedItem.id,
        case_id: newCase.id,
        dropped_at: now
      }, { transaction: t });
    } catch (e) {
      if (e.name !== 'SequelizeUniqueConstraintError') throw e;
    }

    await db.User.increment('total_cases_opened', { by: 1, where: { id: user.id }, transaction: t });

    const currentBest = parseFloat(user.best_item_value) || 0;
    if (itemPrice > currentBest) {
      await db.User.update({
        best_item_value: itemPrice,
        total_items_value: db.Sequelize.literal(`COALESCE(total_items_value, 0) + ${itemPrice}`)
      }, { where: { id: user.id }, transaction: t });
    } else {
      await db.User.update({
        total_items_value: db.Sequelize.literal(`COALESCE(total_items_value, 0) + ${itemPrice}`)
      }, { where: { id: user.id }, transaction: t });
    }

    await t.commit();

    const userForBroadcast = await db.User.findByPk(user.id, {
      attributes: ['id', 'username', 'level', 'steam_avatar_url', 'avatar_url']
    });
    const caseData = { id: newCase.id, name: template.name };
    broadcastDrop(userForBroadcast, selectedItem, caseData, {
      id: liveDropRecord.id,
      isRare: liveDropRecord.is_rare_item,
      isHighlighted: liveDropRecord.is_highlighted
    });

    logger.info(`[FakeActivity] Бот ${user.username} открыл кейс "${template.name}", выпал ${selectedItem.name}`);
  } catch (err) {
    try {
      await t.rollback();
    } catch (rollbackErr) {
      logger.warn('[FakeActivity] rollback уже выполнен или транзакция закрыта:', rollbackErr.message);
    }
    logger.error('[FakeActivity] Ошибка runFakeCaseOpen:', err);
  }
}

/**
 * Пометить один случайный предмет бота как проданный (для правдоподобности инвентаря)
 */
async function runBotSellOneItem() {
  if (!FAKE_ACTIVITY_ENABLED) return;

  const bots = await getBots();
  if (!bots.length) return;

  const bot = bots[Math.floor(Math.random() * bots.length)];
  const inv = await db.UserInventory.findOne({
    where: { user_id: bot.id, status: 'inventory', item_type: 'item' },
    include: [{ model: db.Item, as: 'item', attributes: ['id', 'name', 'price'] }]
  });
  if (!inv || !inv.item) return;

  const price = parseFloat(inv.item.price) || 0;
  const sellPrice = Math.round(price * 0.85);

  await db.sequelize.transaction(async (t) => {
    inv.status = 'sold';
    inv.transaction_date = new Date();
    await inv.save({ transaction: t });
    await db.User.increment('balance', { by: sellPrice, where: { id: bot.id }, transaction: t });
  });

  logger.info(`[FakeActivity] Бот ${bot.username} продал предмет ${inv.item.name}`);
}

/** У ботов в инвентаре должно оставаться 1–50 предметов (чистка «как на новый день»). */
const BOT_INVENTORY_MAX = 50;
const BOT_INVENTORY_LEAVE_MIN = 1;
const BOT_INVENTORY_LEAVE_MAX = 50;
const CLEAR_STATUSES = ['withdrawn', 'used'];

/**
 * Периодическая чистка: если у бота > 50 предметов — обрезаем до 1–50 (как вывел/апгрейд).
 * Запускать по таймеру (например раз в 1–2 часа).
 */
async function runBotClearInventoryBatch() {
  if (!FAKE_ACTIVITY_ENABLED) return;

  const bots = await getBots();
  if (!bots.length) return;

  const candidates = [];
  for (const bot of bots) {
    const count = await db.UserInventory.count({
      where: { user_id: bot.id, status: 'inventory', item_type: 'item' }
    });
    if (count > BOT_INVENTORY_MAX) {
      candidates.push({ bot, count });
    }
  }
  if (!candidates.length) return;

  const { bot, count } = candidates[Math.floor(Math.random() * candidates.length)];
  const leave = BOT_INVENTORY_LEAVE_MIN + Math.floor(Math.random() * (BOT_INVENTORY_LEAVE_MAX - BOT_INVENTORY_LEAVE_MIN + 1));
  const toClear = Math.max(1, count - leave);

  const items = await db.UserInventory.findAll({
    where: { user_id: bot.id, status: 'inventory', item_type: 'item' },
    order: [[db.sequelize.fn('RANDOM')]],
    limit: toClear
  });
  if (!items.length) return;

  const t = await db.sequelize.transaction();
  try {
    for (const inv of items) {
      const status = CLEAR_STATUSES[Math.floor(Math.random() * CLEAR_STATUSES.length)];
      inv.status = status;
      inv.transaction_date = new Date();
      await inv.save({ transaction: t });
    }
    await t.commit();
    logger.info(`[FakeActivity] Бот ${bot.username} «очистил» инвентарь: ${items.length} предметов → ${items.filter(i => i.status === 'withdrawn').length} выведено, ${items.filter(i => i.status === 'used').length} использовано`);
  } catch (err) {
    await t.rollback();
    logger.error('[FakeActivity] Ошибка runBotClearInventoryBatch:', err);
  }
}

/**
 * Ежедневная чистка «на новый день»: у всех ботов с > 50 предметов обрезаем инвентарь до 1–50.
 * После этого боты продолжают открывать кейсы по таймеру. Запускать раз в 24 ч.
 */
async function runBotDailyInventoryCleanup() {
  if (!FAKE_ACTIVITY_ENABLED) return;

  const bots = await getBots();
  if (!bots.length) return;

  let cleaned = 0;
  for (const bot of bots) {
    const count = await db.UserInventory.count({
      where: { user_id: bot.id, status: 'inventory', item_type: 'item' }
    });
    if (count <= BOT_INVENTORY_MAX) continue;

    const leave = BOT_INVENTORY_LEAVE_MIN + Math.floor(Math.random() * (BOT_INVENTORY_LEAVE_MAX - BOT_INVENTORY_LEAVE_MIN + 1));
    const toClear = Math.max(1, count - leave);

    const items = await db.UserInventory.findAll({
      where: { user_id: bot.id, status: 'inventory', item_type: 'item' },
      order: [[db.sequelize.fn('RANDOM')]],
      limit: toClear
    });
    if (!items.length) continue;

    const t = await db.sequelize.transaction();
    try {
      for (const inv of items) {
        const status = CLEAR_STATUSES[Math.floor(Math.random() * CLEAR_STATUSES.length)];
        inv.status = status;
        inv.transaction_date = new Date();
        await inv.save({ transaction: t });
      }
      await t.commit();
      cleaned++;
      logger.info(`[FakeActivity] Ежедневная чистка: бот ${bot.username} — оставлено ~${leave} из ${count} предметов`);
    } catch (err) {
      await t.rollback();
      logger.error(`[FakeActivity] Ошибка runBotDailyInventoryCleanup для бота ${bot.username}:`, err);
    }
  }
  if (cleaned > 0) {
    logger.info(`[FakeActivity] Ежедневная чистка инвентаря завершена: обработано ботов ${cleaned}`);
  }
}

/**
 * Создать запись «апгрейд» от имени бота — растёт счётчик апгрейдов в глобальной статистике.
 */
async function runBotFakeUpgrade() {
  if (!FAKE_ACTIVITY_ENABLED) return;

  const bots = await getBots();
  if (!bots.length) return;

  const bot = bots[Math.floor(Math.random() * bots.length)];
  const success = Math.random() < 0.4;
  const desc = success
    ? `Успешный апгрейд: предмет (${(5 + Math.random() * 30).toFixed(1)}% шанс)`
    : `Неудачный апгрейд: предмет (${(10 + Math.random() * 50).toFixed(1)}% шанс)`;

  try {
    await db.Transaction.create({
      user_id: bot.id,
      type: 'system',
      amount: 0,
      balance_before: 0,
      balance_after: 0,
      description: desc,
      status: 'completed',
      is_system: true
    });
    logger.info(`[FakeActivity] Бот ${bot.username}: запись апгрейда (${success ? 'успех' : 'неудача'})`);
  } catch (err) {
    logger.error('[FakeActivity] Ошибка runBotFakeUpgrade:', err);
  }
}

/**
 * Создать запись «игра» от имени бота — растёт «Игр сыграно» в футере (TicTacToe + Safe Cracker).
 */
async function runBotFakeGame() {
  if (!FAKE_ACTIVITY_ENABLED) return;

  const bots = await getBots();
  if (!bots.length) return;

  const bot = bots[Math.floor(Math.random() * bots.length)];
  const kind = Math.random() < 0.6 ? 'tictactoe' : 'safecracker';

  try {
    if (kind === 'tictactoe') {
      const results = ['win', 'lose', 'draw'];
      const result = results[Math.floor(Math.random() * results.length)];
      const winner = result === 'draw' ? 'draw' : result === 'win' ? 'player' : 'bot';
      await db.TicTacToeGame.create({
        user_id: bot.id,
        game_state: {
          board: [null, null, null, null, null, null, null, null, null],
          currentPlayer: 'player',
          winner,
          status: 'finished'
        },
        attempts_left: 0,
        bot_goes_first: Math.random() < 0.5,
        result,
        reward_given: false
      });
      logger.info(`[FakeActivity] Бот ${bot.username}: сыграл в крестики-нолики (${result})`);
    } else {
      const matches = Math.floor(Math.random() * 4);
      await db.Transaction.create({
        user_id: bot.id,
        type: 'system',
        amount: 0,
        balance_before: 0,
        balance_after: 0,
        description: `Игра в Safe Cracker (${matches} совпадения)`,
        status: 'completed',
        is_system: true
      });
      logger.info(`[FakeActivity] Бот ${bot.username}: запись игры Safe Cracker`);
    }
  } catch (err) {
    logger.error('[FakeActivity] Ошибка runBotFakeGame:', err);
  }
}

module.exports = {
  getBots,
  runFakeCaseOpen,
  runBotSellOneItem,
  runBotClearInventoryBatch,
  runBotDailyInventoryCleanup,
  runBotFakeUpgrade,
  runBotFakeGame,
  FAKE_ACTIVITY_ENABLED
};
