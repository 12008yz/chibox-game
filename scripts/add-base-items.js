// Оптимизированная версия импорта предметов с точным парсингом изображений
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const db = require('../models');

// Импортируем сервисы
const SteamPriceService = require('../services/steamPriceService');
const FixDropWeights = require('./fix-drop-weights');
const COMPLETE_ITEMS_URLS = require('../utils/linkItems-complete');

// Инициализируем сервисы
const steamPriceService = new SteamPriceService(process.env.STEAM_API_KEY);

// Кэш для изображений и цен
const CACHE_FILE = path.join(__dirname, 'import-cache.json');
let cache = {};

// Загружаем кэш при старте
function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      console.log(`📂 Загружен кэш с ${Object.keys(cache).length} записями`);
    }
  } catch (error) {
    console.warn('⚠️ Не удалось загрузить кэш:', error.message);
    cache = {};
  }
}

// Сохраняем кэш
function saveCache() {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
    console.log(`💾 Кэш сохранен с ${Object.keys(cache).length} записями`);
  } catch (error) {
    console.error('❌ Ошибка сохранения кэша:', error.message);
  }
}

// Последовательная обработка предметов с задержками для парсинга HTML
async function processBatch(items, batchSize = 1) { // Делаем по 1 предмету для парсинга HTML
  const results = [];

  console.log(`🔄 Будем обрабатывать ${items.length} предметов последовательно с задержками`);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    console.log(`🔄 Обрабатываем предмет ${i + 1}/${items.length}: ${extractMarketHashNameFromUrl(item.url)}`);

    try {
      const result = await processItemOptimized(item.url, item.rarity, item.caseType);

      if (result) {
        results.push(result);
        console.log(`✅ Предмет ${i + 1}/${items.length} обработан успешно`);
      } else {
        console.log(`❌ Предмет ${i + 1}/${items.length} не удалось обработать`);
      }
    } catch (error) {
      console.error(`❌ Ошибка обработки предмета ${i + 1}/${items.length}:`, error.message);
    }

    // Сохраняем кэш после каждого предмета
    saveCache();

    // Задержка между предметами для предотвращения блокировки Steam
    if (i + 1 < items.length) {
      const delay = 5000; // 5 секунд между предметами
      console.log(`⏳ Пауза ${delay/1000} секунд перед следующим предметом...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  return results;
}

// Оптимизированная обработка одного предмета
async function processItemOptimized(url, originalRarity, caseType) {
  try {
    const marketHashName = extractMarketHashNameFromUrl(url);
    if (!marketHashName) {
      console.error(`❌ Неверный URL: ${url}`);
      return null;
    }

    // Проверяем существование предмета
    const existingItem = await db.Item.findOne({
      where: { steam_market_hash_name: marketHashName }
    });

    if (existingItem) {
      console.log(`⏭️ Предмет существует: ${marketHashName}`);
      return existingItem;
    }

    // Проверяем кэш
    const cacheKey = marketHashName;
    let priceData = cache[cacheKey]?.price;
    let imageUrl = cache[cacheKey]?.image;

    // Получаем цену (с кэшированием)
    if (!priceData || isDataExpired(cache[cacheKey]?.priceTimestamp)) {
      console.log(`💰 Получаем цену для: ${marketHashName}`);
      priceData = await steamPriceService.getItemPrice(marketHashName);

      // Кэшируем цену
      if (!cache[cacheKey]) cache[cacheKey] = {};
      cache[cacheKey].price = priceData;
      cache[cacheKey].priceTimestamp = Date.now();
    } else {
      console.log(`📋 Цена из кэша: ${marketHashName}`);
    }

    // Получаем изображение (с кэшированием)
    if (!imageUrl || !isValidSteamImageUrl(imageUrl)) {
      console.log(`🖼️ Получаем изображение: ${marketHashName}`);
      imageUrl = await getItemImageOptimized(marketHashName, url);

      // Кэшируем изображение
      if (!cache[cacheKey]) cache[cacheKey] = {};
      cache[cacheKey].image = imageUrl;
    } else {
      console.log(`📋 Изображение из кэша: ${marketHashName}`);
    }

    // Определяем цену и редкость
    let priceRub, actualRarity, priceUsd;
    if (priceData.success && priceData.price_rub > 0) {
      priceRub = priceData.price_rub;
      priceUsd = priceData.price_usd;
      actualRarity = priceData.category;
    } else {
      priceRub = FALLBACK_PRICES[originalRarity] || 8;
      priceUsd = Math.round((priceRub / 95) * 100) / 100;
      actualRarity = originalRarity;
    }

    // Создаем предмет
    const newItem = await createItemInDatabase(marketHashName, imageUrl, priceRub, priceUsd, actualRarity, caseType);

    console.log(`✅ Добавлен: ${marketHashName} - ₽${priceRub}`);
    return newItem;

  } catch (error) {
    console.error(`❌ Ошибка обработки ${url}:`, error.message);
    return null;
  }
}

// Точный парсер изображений из HTML страницы Steam Market
async function getItemImageOptimized(marketHashName, originalUrl) {
  try {
    console.log(`🔍 Парсим изображение для: ${marketHashName}`);
    console.log(`📄 URL страницы: ${originalUrl}`);

    // Парсим страницу Steam Market напрямую
    const imageUrl = await parseExactImageFromSteamPage(originalUrl);

    if (imageUrl) {
      console.log(`✅ Получено изображение: ${imageUrl}`);
      return imageUrl;
    } else {
      console.log(`❌ Не удалось получить изображение для: ${marketHashName}`);
      return null;
    }
  } catch (error) {
    console.error(`❌ Ошибка получения изображения для ${marketHashName}:`, error.message);
    return null;
  }
}

// Точный парсер изображения из блока market_listing_largeimage
async function parseExactImageFromSteamPage(url) {
  try {
    console.log(`🔍 Парсим страницу Steam Market: ${url}`);

    // Настройки запроса для имитации браузера
    const config = {
      timeout: 15000, // Увеличенный таймаут
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Cache-Control': 'max-age=0'
      }
    };

    // Делаем запрос к странице предмета
    const response = await axios.get(url, config);

    if (response.status !== 200) {
      throw new Error(`HTTP статус ${response.status}`);
    }

    // Загружаем HTML с помощью cheerio
    const $ = cheerio.load(response.data);

    // ТОЧНЫЙ поиск изображения в блоке market_listing_largeimage
    console.log(`🔍 Ищем блок <div class="market_listing_largeimage">`);

    const largeImageDiv = $('.market_listing_largeimage');

    if (largeImageDiv.length === 0) {
      console.log(`⚠️ Блок .market_listing_largeimage не найден`);
      return null;
    }

    // Извлекаем src из img внутри этого блока
    const imgElement = largeImageDiv.find('img');

    if (imgElement.length === 0) {
      console.log(`⚠️ Элемент <img> внутри .market_listing_largeimage не найден`);
      return null;
    }

    const imageSrc = imgElement.attr('src');

    if (!imageSrc) {
      console.log(`⚠️ Атрибут src у изображения отсутствует`);
      return null;
    }

    // Проверяем, что это валидная ссылка на изображение Steam
    if (!isValidSteamImageUrl(imageSrc)) {
      console.log(`⚠️ Невалидная ссылка на изображение: ${imageSrc}`);
      return null;
    }

    console.log(`✅ Найдено изображение в market_listing_largeimage: ${imageSrc}`);
    return imageSrc;

  } catch (error) {
    if (error.code === 'ECONNABORTED') {
      console.error(`❌ Таймаут при загрузке страницы: ${url}`);
    } else if (error.response) {
      console.error(`❌ HTTP ошибка ${error.response.status}: ${url}`);
    } else {
      console.error(`❌ Ошибка парсинга страницы ${url}:`, error.message);
    }
    return null;
  }
}

// Функция для проверки валидности ссылки на изображение Steam
function isValidSteamImageUrl(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }

  // Проверяем, что это изображение из Steam CDN
  const steamImageRegex = /^https?:\/\/(steamcommunity-a\.akamaihd\.net|steamcdn-a\.akamaihd\.net|steamuserimages-a\.akamaihd\.net|community\.akamai\.steamstatic\.com|cdn\.akamai\.steamstatic\.com)/;

  // Проверяем расширение файла или параметры изображения
  const validImagePattern = /\.(jpg|jpeg|png|gif|webp)(\?.*)?$|\/\d+fx\d+f?$/i;

  return steamImageRegex.test(url) && validImagePattern.test(url);
}

// Проверка устаревания данных в кэше (24 часа)
function isDataExpired(timestamp, maxAge = 24 * 60 * 60 * 1000) {
  return !timestamp || (Date.now() - timestamp) > maxAge;
}

// Создание предмета в базе данных
async function createItemInDatabase(marketHashName, imageUrl, priceRub, priceUsd, actualRarity, caseType) {
  const weaponType = extractWeaponType(marketHashName);
  const skinName = extractSkinName(marketHashName);
  const exterior = extractExterior(marketHashName);

  let itemOrigin;
  if (caseType.startsWith('subscription_tier')) {
    itemOrigin = 'subscription_case';
  } else {
    itemOrigin = `${caseType}_case`;
  }

  const steamMarketUrl = `https://steamcommunity.com/market/listings/730/${encodeURIComponent(marketHashName)}`;

  return await db.Item.create({
    name: marketHashName,
    description: `CS2 ${actualRarity} skin ${marketHashName}`,
    image_url: imageUrl,
    price: priceRub,
    rarity: actualRarity,
    drop_weight: 1,
    weapon_type: weaponType,
    skin_name: skinName,
    steam_market_hash_name: marketHashName,
    steam_market_url: steamMarketUrl,
    is_available: true,
    exterior: exterior,
    quality: extractQuality(marketHashName),
    in_stock: false,
    is_tradable: true,
    float_value: null,
    stickers: null,
    origin: itemOrigin,
    actual_price_rub: priceRub,
    price_last_updated: new Date(),
    price_source: 'steam_api'
  });
}

// Основная оптимизированная функция импорта
async function populateDatabaseOptimized(limitPerCategory = 100) {
  console.log('🚀 Запуск оптимизированного импорта предметов CS2...\n');

  // Загружаем кэш
  loadCache();

  // Подготавливаем список предметов для обработки
  const allItems = [];

  for (const [caseType, categories] of Object.entries(ITEMS_URLS)) {
    for (const [rarity, urls] of Object.entries(categories)) {
      const itemsToProcess = urls.slice(0, limitPerCategory);

      itemsToProcess.forEach(url => {
        allItems.push({ url, rarity, caseType });
      });
    }
  }

  console.log(`📊 Подготовлено ${allItems.length} предметов для обработки`);

  // Создаем шаблоны кейсов
  await createCaseTemplates();

  // Обрабатываем батчами
  const results = await processBatch(allItems, 5); // 5 предметов в батче

  console.log(`✅ Обработано ${results.length} предметов`);

  // Сохраняем финальный кэш
  saveCache();

  // Настраиваем веса
  await FixDropWeights.calculateWeightsByPrice();
  await linkItemsToCaseTemplates();

  console.log('\n🎉 Оптимизированный импорт завершен!');
}

// Константы и конфигурации
const FALLBACK_PRICES = {
  consumer: 8,
  industrial: 20,
  milspec: 90,
  restricted: 500,
  classified: 1500,
  covert: 10000,
  contraband: 30000,
  exotic: 100000
};

// Базовые конфигурации кейсов
const BASE_CASE_CONFIGS = {
  subscription_tier1: {
    name: 'Подписочные кейсы (Уровень 1)',
    price: null,
    target_expected_value: 40,
    min_subscription_tier: 1,
    type: 'daily'
  },
  subscription_tier2: {
    name: 'Подписочные кейсы (Уровень 2)',
    price: null,
    target_expected_value: 80,
    min_subscription_tier: 2,
    type: 'daily'
  },
  subscription_tier3: {
    name: 'Подписочные кейсы (Уровень 3)',
    price: null,
    target_expected_value: 180,
    min_subscription_tier: 3,
    type: 'daily'
  },
  purchase: {
    name: 'Покупные кейсы ₽99',
    price: 99,
    target_expected_value: 79.20,
    min_subscription_tier: 0,
    type: 'premium'
  },
  premium: {
    name: 'Премиум кейсы ₽499',
    price: 499,
    target_expected_value: 399.20,
    min_subscription_tier: 0,
    type: 'special'
  }
};

// Предметы для разных типов кейсов
const ITEMS_URLS = {
  subscription_tier1: {
    consumer: COMPLETE_ITEMS_URLS.subscription.consumer.slice(0, 50),
    industrial: COMPLETE_ITEMS_URLS.subscription.industrial.slice(0, 30),
    milspec: COMPLETE_ITEMS_URLS.subscription.milspec.slice(0, 25),
    restricted: COMPLETE_ITEMS_URLS.subscription.restricted.slice(0, 15),
    classified: COMPLETE_ITEMS_URLS.subscription.classified.slice(0, 8),
    covert: COMPLETE_ITEMS_URLS.subscription.covert.slice(0, 5),
    contraband: COMPLETE_ITEMS_URLS.subscription.extraordinary.slice(0, 3),
    exotic: COMPLETE_ITEMS_URLS.subscription.exotic.slice(0, 2)
  },
  subscription_tier2: {
    consumer: COMPLETE_ITEMS_URLS.subscription.consumer.slice(0, 50),
    industrial: COMPLETE_ITEMS_URLS.subscription.industrial.slice(0, 30),
    milspec: COMPLETE_ITEMS_URLS.subscription.milspec.slice(0, 25),
    restricted: COMPLETE_ITEMS_URLS.subscription.restricted.slice(0, 15),
    classified: COMPLETE_ITEMS_URLS.subscription.classified.slice(0, 8),
    covert: COMPLETE_ITEMS_URLS.subscription.covert.slice(0, 5),
    contraband: COMPLETE_ITEMS_URLS.subscription.extraordinary.slice(0, 3),
    exotic: COMPLETE_ITEMS_URLS.subscription.exotic.slice(0, 2)
  },
  subscription_tier3: {
    consumer: COMPLETE_ITEMS_URLS.subscription.consumer.slice(0, 50),
    industrial: COMPLETE_ITEMS_URLS.subscription.industrial.slice(0, 30),
    milspec: COMPLETE_ITEMS_URLS.subscription.milspec.slice(0, 25),
    restricted: COMPLETE_ITEMS_URLS.subscription.restricted.slice(0, 15),
    classified: COMPLETE_ITEMS_URLS.subscription.classified.slice(0, 8),
    covert: COMPLETE_ITEMS_URLS.subscription.covert.slice(0, 5),
    contraband: COMPLETE_ITEMS_URLS.subscription.extraordinary.slice(0, 3),
    exotic: COMPLETE_ITEMS_URLS.subscription.exotic.slice(0, 2)
  },
  purchase: {
    consumer: COMPLETE_ITEMS_URLS.subscription.consumer.slice(0, 50),
    industrial: COMPLETE_ITEMS_URLS.subscription.industrial.slice(0, 30),
    milspec: COMPLETE_ITEMS_URLS.subscription.milspec.slice(0, 25),
    restricted: COMPLETE_ITEMS_URLS.subscription.restricted.slice(0, 15),
    classified: COMPLETE_ITEMS_URLS.subscription.classified.slice(0, 10),
    covert: COMPLETE_ITEMS_URLS.subscription.covert.slice(0, 6),
    contraband: COMPLETE_ITEMS_URLS.subscription.extraordinary.slice(0, 4),
    exotic: COMPLETE_ITEMS_URLS.subscription.exotic.slice(0, 3)
  },
  premium: {
    consumer: COMPLETE_ITEMS_URLS.subscription.consumer.slice(0, 50),
    industrial: COMPLETE_ITEMS_URLS.subscription.industrial.slice(0, 30),
    milspec: COMPLETE_ITEMS_URLS.subscription.milspec.slice(0, 20),
    restricted: COMPLETE_ITEMS_URLS.subscription.restricted.slice(0, 15),
    classified: COMPLETE_ITEMS_URLS.subscription.classified.slice(0, 10),
    covert: COMPLETE_ITEMS_URLS.subscription.covert.slice(0, 8),
    contraband: COMPLETE_ITEMS_URLS.subscription.extraordinary.slice(0, 5),
    exotic: COMPLETE_ITEMS_URLS.subscription.exotic.slice(0, 3)
  }
};

// Вспомогательные функции (из оригинального файла)
function extractMarketHashNameFromUrl(url) {
  try {
    const match = url.match(/\/market\/listings\/730\/(.+)$/);
    if (match) {
      return decodeURIComponent(match[1]);
    }
    return null;
  } catch (error) {
    console.error('Ошибка извлечения имени из URL:', url, error.message);
    return null;
  }
}

function extractWeaponType(marketHashName) {
  const parts = marketHashName.split(' | ')[0];
  return parts || 'Unknown';
}

function extractSkinName(marketHashName) {
  const parts = marketHashName.split(' | ');
  if (parts.length < 2) return null;
  const skinWithExterior = parts[1];
  return skinWithExterior.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

function extractExterior(marketHashName) {
  const match = marketHashName.match(/\(([^)]+)\)$/);
  return match ? match[1] : null;
}

function extractQuality(marketHashName) {
  if (marketHashName.includes('StatTrak™')) return 'StatTrak';
  if (marketHashName.includes('Souvenir')) return 'Souvenir';
  if (marketHashName.includes('★')) return 'Special';
  return null;
}

// Функция для создания шаблонов кейсов
async function createCaseTemplates() {
  console.log('📦 Создаем шаблоны кейсов...\n');

  const templates = [
    {
      name: 'Ежедневный кейс (Уровень 1)',
      description: 'Бесплатный ежедневный кейс для подписчиков 1 уровня',
      type: 'daily',
      min_subscription_tier: 1,
      is_active: true,
      cooldown_hours: 0.003,
      price: null,
      color_scheme: '#4CAF50',
      sort_order: 1
    },
    {
      name: 'Ежедневный кейс (Уровень 2)',
      description: 'Улучшенный ежедневный кейс для подписчиков 2 уровня',
      type: 'daily',
      min_subscription_tier: 2,
      is_active: true,
      cooldown_hours: 0.003,
      price: null,
      color_scheme: '#2196F3',
      sort_order: 2
    },
    {
      name: 'Ежедневный кейс (Уровень 3)',
      description: 'Премиум ежедневный кейс для подписчиков 3 уровня',
      type: 'daily',
      min_subscription_tier: 3,
      is_active: true,
      cooldown_hours: 0.003,
      price: null,
      color_scheme: '#9C27B0',
      sort_order: 3
    },
    {
      name: 'Покупной кейс',
      description: 'Кейс за ₽99',
      type: 'premium',
      min_subscription_tier: 0,
      is_active: true,
      price: 99,
      color_scheme: '#FF9800',
      sort_order: 4
    },
    {
      name: 'Премиум кейс',
      description: 'Эксклюзивный кейс за ₽499',
      type: 'special',
      min_subscription_tier: 0,
      is_active: true,
      price: 499,
      color_scheme: '#F44336',
      sort_order: 5
    }
  ];

  const createdTemplates = [];
  for (const template of templates) {
    try {
      const existing = await db.CaseTemplate.findOne({ where: { name: template.name } });
      if (!existing) {
        const created = await db.CaseTemplate.create(template);
        createdTemplates.push(created);
        console.log(`✅ Создан шаблон кейса: ${template.name}`);
      } else {
        createdTemplates.push(existing);
        console.log(`⏭️ Шаблон уже существует: ${template.name}`);
      }
    } catch (error) {
      console.error(`❌ Ошибка создания шаблона ${template.name}:`, error.message);
    }
  }

  return createdTemplates;
}

// Функция для связывания предметов с шаблонами кейсов
async function linkItemsToCaseTemplates() {
  console.log('\n🔗 Связываем предметы с шаблонами кейсов...\n');

  const CASE_ITEM_MAPPING = {
    'Ежедневный кейс (Уровень 1)': 'subscription_case',
    'Ежедневный кейс (Уровень 2)': 'subscription_case',
    'Ежедневный кейс (Уровень 3)': 'subscription_case',
    'Покупной кейс': 'purchase_case',
    'Премиум кейс': 'premium_case'
  };

  try {
    const caseTemplates = await db.CaseTemplate.findAll({
      where: { is_active: true }
    });

    for (const template of caseTemplates) {
      console.log(`🎯 Обрабатываем кейс: ${template.name}`);

      let originPattern = CASE_ITEM_MAPPING[template.name];

      if (!originPattern) {
        if (template.name.includes('Ежедневный') || template.type === 'daily') {
          originPattern = 'subscription_case';
        } else if (template.name.includes('Покупной') || (template.price && template.price <= 150)) {
          originPattern = 'purchase_case';
        } else if (template.name.includes('Премиум') || (template.price && template.price > 150)) {
          originPattern = 'premium_case';
        }
      }

      if (!originPattern) {
        console.warn(`⚠️ Не удалось определить тип для кейса: ${template.name}`);
        continue;
      }

      const items = await db.Item.findAll({
        where: {
          is_available: true,
          origin: originPattern
        }
      });

      if (items.length === 0) {
        console.log(`   ❌ Нет предметов с origin: ${originPattern}`);
        continue;
      }

      await template.setItems([]);
      await template.addItems(items);

      console.log(`   ✅ Связано ${items.length} предметов с кейсом: ${template.name}`);
    }

    console.log('\n🎉 Связывание завершено успешно!');
  } catch (error) {
    console.error('❌ Ошибка при связывании предметов с кейсами:', error);
  }
}

module.exports = {
  populateDatabaseOptimized,
  processItemOptimized,
  createCaseTemplates,
  linkItemsToCaseTemplates,
  loadCache,
  saveCache
};

// Запуск если вызван напрямую
if (require.main === module) {
  console.log('🚀 Запуск оптимизированного импорта...');

  populateDatabaseOptimized(20) // Тестовый запуск с 20 предметами на категорию
    .then(() => {
      console.log('\n🎉 Оптимизированный импорт завершен успешно!');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Ошибка оптимизированного импорта:', error);
      process.exit(1);
    });
}
