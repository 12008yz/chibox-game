const LisService = require('../services/lisService');
const db = require('../models');
const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Создаем директорию для логов, если её нет
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Настройка логгера
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: path.join(logsDir, 'import-lis-skins.log')
    })
  ],
});

// Соответствие rarity из LIS-Skins -> ENUM базы данных
const rarityMap = {
  consumer: 'consumer',
  industrial: 'industrial',
  milspec: 'milspec',
  restricted: 'restricted',
  classified: 'classified',
  covert: 'covert',
  contraband: 'contraband',
  exotic: 'exotic',
  default: 'consumer'
};

// Маппинг предмета из LIS-Skins в формат базы данных
function mapLisItemToDb(item) {
  if (!item || !item.market_hash_name) {
    return null;
  }

  const rarity = rarityMap[item.rarity?.toLowerCase()] || rarityMap.default;

  return {
    name: item.name || item.market_hash_name,
    description: JSON.stringify(item),
    image_url: item.image || null,
    price: parseFloat(item.min_price) || 0,
    rarity,
    drop_weight: 1,
    weapon_type: item.weapon || null,
    skin_name: item.market_hash_name.includes(' | ') ? item.market_hash_name.split(' | ')[1] : '',
    category_id: null,
    steam_market_hash_name: item.market_hash_name,
    is_available: true,
    min_subscription_tier: 0,
    float_value: item.float_value || null,
    exterior: item.exterior || null,
    stickers: null,
    quality: item.quality || null,

    // LIS-Skins специфичные поля
    lis_id: item.id || null,
    lis_rarity: item.rarity || '',
    lis_quality: item.quality || '',
    lis_type: item.type || '',
    lis_exterior: item.exterior || '',
    lis_weapon: item.weapon || '',
    lis_category: item.category || '',
    lis_tags: item.tags || {}
  };
}

async function saveOrUpdateItem(itemData) {
  if (!itemData || !itemData.steam_market_hash_name) return null;
  try {
    const [item, created] = await db.Item.findOrCreate({
      where: { steam_market_hash_name: itemData.steam_market_hash_name },
      defaults: itemData
    });
    if (!created) {
      await item.update(itemData);
    }
    return item;
  } catch (error) {
    logger.error(`Ошибка при сохранении предмета ${itemData.steam_market_hash_name}:`, error);
    return null;
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function importLisItems(options = {}) {
  const lisConfig = LisService.loadConfig();
  const lisService = new LisService(lisConfig);

  await lisService.initialize();
  if (!lisService.isLoggedIn) {
    logger.error('Ошибка авторизации на LIS-Skins. Проверьте cookies и CSRF-токен.');
    return;
  }

  const categories = [
    { id: 'knife', name: 'Ножи' },
    { id: 'pistol', name: 'Пистолеты' },
    { id: 'rifle', name: 'Винтовки' },
    { id: 'smg', name: 'Пистолеты-пулеметы' },
    { id: 'heavy', name: 'Тяжелое оружие' },
    { id: 'glove', name: 'Перчатки' },
    { id: 'sticker', name: 'Наклейки' },
    { id: 'agent', name: 'Агенты' }
  ];

  const maxPages = options.maxPages || Infinity;
  const maxItems = options.maxItems || Infinity;
  const delayMs = options.delay || 1000;

  let totalImported = 0;
  const processedItems = new Set();

  for (const category of categories) {
    logger.info(`\n=== Обработка категории: ${category.name} (${category.id}) ===`);
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= maxPages && totalImported < maxItems) {
      try {
        const result = await lisService.axiosInstance.get('/api/market/items', {
          params: {
            category: category.id,
            page,
            limit: 100,
            sort: 'price.asc'
          }
        });

        if (!result.data || !result.data.success) {
          logger.warn(`Ошибка получения предметов: ${result.data?.message || 'Неизвестная ошибка'}`);
          break;
        }

        const items = result.data.items || [];
        logger.info(`Получено ${items.length} предметов на странице ${page} категории ${category.name}`);

        if (items.length === 0) {
          hasMore = false;
          break;
        }

        for (const item of items) {
          if (totalImported >= maxItems) {
            hasMore = false;
            break;
          }
          if (processedItems.has(item.id)) continue;
          processedItems.add(item.id);

          const itemDetails = await lisService.getItemDetails(item.id);
          if (!itemDetails) {
            logger.warn(`Не удалось получить детали предмета ID: ${item.id}`);
            continue;
          }

          const mappedItem = mapLisItemToDb(itemDetails);
          if (!mappedItem) continue;

          await saveOrUpdateItem(mappedItem);
          totalImported++;
        }

        page++;
        await delay(delayMs);
      } catch (error) {
        logger.error(`Ошибка при обработке страницы ${page} категории ${category.name}:`, error);
        break;
      }
    }
  }

  logger.info(`\nИмпорт завершен. Всего импортировано предметов: ${totalImported}`);
  console.log(`\nИмпорт завершен. Всего импортировано предметов: ${totalImported}`);
}

if (require.main === module) {
  importLisItems().catch(error => {
    logger.error('Необработанная ошибка при импорте:', error);
    console.error('Ошибка при импорте:', error);
  });
}

module.exports = importLisItems;
