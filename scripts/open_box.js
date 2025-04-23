const { Op } = require('sequelize');
const db = require('../models');
const { CaseTemplate, Item } = db;

// Взвешенный случайный выбор по весам
function weightedRandom(pool) {
  const totalWeight = pool.reduce((sum, curr) => sum + curr.drop_weight, 0);
  let random = Math.random() * totalWeight;
  for (const entry of pool) {
    random -= entry.drop_weight;
    if (random <= 0) return entry.item_id || entry.id;
  }
  // fallback если что-то пошло не так
  return pool[0].item_id || pool[0].id;
}

/**
 * Открывает ежедневный кейс: выбирает случайный предмет взвешено и возвращает его инфу для привлечения к BUFF/Steam.
 * @returns {Promise<object>} - объект выбранного предмета
 */
async function openDailyCase() {
  // 1. Найти шаблон кейса
  const caseTemplate = await CaseTemplate.findOne({
    where: { name: 'Ежедневный кейс', is_active: true },
  });
  if (!caseTemplate) {
    throw new Error('Ежедневный кейс не найден.');
  }

  // 2. Поле item_pool_config: [{id, drop_weight}]
  let pool = [];
  if (typeof caseTemplate.item_pool_config === 'string') {
    try {
      pool = JSON.parse(caseTemplate.item_pool_config);
    } catch (e) {
      console.error('Ошибка парсинга item_pool_config:', e.message);
      pool = [];
    }
  } else if (Array.isArray(caseTemplate.item_pool_config)) {
    pool = caseTemplate.item_pool_config;
  }
  if (pool.length === 0) {
    throw new Error('В пуле кейса нет предметов.');
  }

  // 3. Преобразовать объект pool в массив с drop_weight
  const poolArray = Object.values(pool).map(item => ({
    id: item.id,
    drop_weight: item.probability || 0
  }));

  if (poolArray.length === 0) {
    throw new Error('В пуле кейса нет предметов.');
  }

  // 4. Взвешенный случайный выбор
  const selectedId = weightedRandom(poolArray);

  // 4. Найти предмет в БД
  const item = await Item.findOne({
    where: { id: selectedId, is_available: true },
  });
  if (!item) {
    throw new Error('Предмет не найден или недоступен.');
  }

  // 5. Вернуть всю важную инфу для матчинга с BUFF/Steam
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    image_url: item.image_url,
    price: item.price,
    rarity: item.rarity,
    weapon_type: item.weapon_type,
    skin_name: item.skin_name,
    steam_market_hash_name: item.steam_market_hash_name,
    is_available: item.is_available,
    float_value: item.float_value,
    exterior: item.exterior,
    stickers: item.stickers,
    quality: item.quality,
    buff_id: item.buff_id,
    origin: item.origin,
    created_at: item.created_at,
    updated_at: item.updated_at,
  };
}

async function main() {
  try {
    const result = await openDailyCase();
    console.log('Открыт предмет из кейса:', result);
  } catch (error) {
    console.error('Ошибка при открытии кейса:', error.message);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  openDailyCase,
};
