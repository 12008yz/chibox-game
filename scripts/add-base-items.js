// Оптимизированная версия импорта предметов с точным парсингом изображений
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const db = require('../models');

// Импортируем сервисы
const SteamPriceService = require('../services/steamPriceService');
const { calculateCorrectWeightByPrice } = require('../utils/dropWeightCalculator');
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

        // Задержка только для новых предметов (если result.isNew === true)
        if (result.isNew && i + 1 < items.length) {
          const delay = 8000; // 5 секунд между новыми предметами
          console.log(`⏳ Пауза ${delay/1000} секунд после импорта нового предмета...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      } else {
        console.log(`❌ Предмет ${i + 1}/${items.length} не удалось обработать`);
      }
    } catch (error) {
      console.error(`❌ Ошибка обработки предмета ${i + 1}/${items.length}:`, error.message);
    }

    // Сохраняем кэш после каждого предмета
    saveCache();
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
      return { ...existingItem.toJSON(), isNew: false };
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
    return { ...newItem.toJSON(), isNew: true };

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

  let itemOrigin = `${caseType}_case`;

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

  // Настраиваем веса используя новую улучшенную систему
  await updateItemWeights();
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

// Предметы для разных типов кейсов
const ITEMS_URLS = {
  free_daily: {
    consumer: COMPLETE_ITEMS_URLS.subscription.consumer.slice(0, 1000),
    industrial: COMPLETE_ITEMS_URLS.subscription.industrial.slice(0, 1000),
    milspec: COMPLETE_ITEMS_URLS.subscription.milspec.slice(0, 50),
    restricted: COMPLETE_ITEMS_URLS.subscription.restricted.slice(0, 50),
    classified: COMPLETE_ITEMS_URLS.subscription.classified.slice(0, 20),
    covert: COMPLETE_ITEMS_URLS.subscription.covert.slice(0, 10),
    contraband: COMPLETE_ITEMS_URLS.subscription.extraordinary.slice(0, 5),
    exotic: COMPLETE_ITEMS_URLS.subscription.exotic.slice(0, 5)
  },
  subscription_tier1: {
    consumer: COMPLETE_ITEMS_URLS.subscription.consumer.slice(0, 1000),
    industrial: COMPLETE_ITEMS_URLS.subscription.industrial.slice(0, 1000),
    milspec: COMPLETE_ITEMS_URLS.subscription.milspec.slice(0, 100),
    restricted: COMPLETE_ITEMS_URLS.subscription.restricted.slice(0, 1000),
    classified: COMPLETE_ITEMS_URLS.subscription.classified.slice(0, 1000),
    covert: COMPLETE_ITEMS_URLS.subscription.covert.slice(0, 100),
    contraband: COMPLETE_ITEMS_URLS.subscription.extraordinary.slice(0, 1000),
    exotic: COMPLETE_ITEMS_URLS.subscription.exotic.slice(0, 100)
  },
  subscription_tier2: {
    consumer: COMPLETE_ITEMS_URLS.subscription.consumer.slice(0, 1000),
    industrial: COMPLETE_ITEMS_URLS.subscription.industrial.slice(0, 1000),
    milspec: COMPLETE_ITEMS_URLS.subscription.milspec.slice(0, 1000),
    restricted: COMPLETE_ITEMS_URLS.subscription.restricted.slice(0, 100),
    classified: COMPLETE_ITEMS_URLS.subscription.classified.slice(0, 100),
    covert: COMPLETE_ITEMS_URLS.subscription.covert.slice(0, 100),
    contraband: COMPLETE_ITEMS_URLS.subscription.extraordinary.slice(0, 100),
    exotic: COMPLETE_ITEMS_URLS.subscription.exotic.slice(0, 100)
  },
  subscription_tier3: {
    consumer: COMPLETE_ITEMS_URLS.subscription.consumer.slice(0, 100),
    industrial: COMPLETE_ITEMS_URLS.subscription.industrial.slice(0, 100),
    milspec: COMPLETE_ITEMS_URLS.subscription.milspec.slice(0, 100),
    restricted: COMPLETE_ITEMS_URLS.subscription.restricted.slice(0, 100),
    classified: COMPLETE_ITEMS_URLS.subscription.classified.slice(0, 100),
    covert: COMPLETE_ITEMS_URLS.subscription.covert.slice(0, 5),
    contraband: COMPLETE_ITEMS_URLS.subscription.extraordinary.slice(0, 100),
    exotic: COMPLETE_ITEMS_URLS.subscription.exotic.slice(0, 100)
  },
  bonus: {
    consumer: COMPLETE_ITEMS_URLS.subscription.consumer.slice(0, 1000),
    industrial: COMPLETE_ITEMS_URLS.subscription.industrial.slice(0, 1000),
    milspec: COMPLETE_ITEMS_URLS.subscription.milspec.slice(0, 100),
    restricted: COMPLETE_ITEMS_URLS.subscription.restricted.slice(0, 100),
    classified: COMPLETE_ITEMS_URLS.subscription.classified.slice(0, 100),
    covert: COMPLETE_ITEMS_URLS.subscription.covert.slice(0, 50),
    contraband: COMPLETE_ITEMS_URLS.subscription.extraordinary.slice(0, 50),
    exotic: COMPLETE_ITEMS_URLS.subscription.exotic.slice(0, 50)
  },
  purchase: {
    consumer: COMPLETE_ITEMS_URLS.subscription.consumer.slice(0, 1000),
    industrial: COMPLETE_ITEMS_URLS.subscription.industrial.slice(0, 1000),
    milspec: COMPLETE_ITEMS_URLS.subscription.milspec.slice(0, 100),
    restricted: COMPLETE_ITEMS_URLS.subscription.restricted.slice(0, 100),
    classified: COMPLETE_ITEMS_URLS.subscription.classified.slice(0, 100),
    covert: COMPLETE_ITEMS_URLS.subscription.covert.slice(0, 100),
    contraband: COMPLETE_ITEMS_URLS.subscription.extraordinary.slice(0, 100),
    exotic: COMPLETE_ITEMS_URLS.subscription.exotic.slice(0, 100)
  },
  premium: {
    consumer: COMPLETE_ITEMS_URLS.subscription.consumer.slice(0, 1000),
    industrial: COMPLETE_ITEMS_URLS.subscription.industrial.slice(0, 1000),
    milspec: COMPLETE_ITEMS_URLS.subscription.milspec.slice(0, 100),
    restricted: COMPLETE_ITEMS_URLS.subscription.restricted.slice(0, 100),
    classified: COMPLETE_ITEMS_URLS.subscription.classified.slice(0, 100),
    covert: COMPLETE_ITEMS_URLS.subscription.covert.slice(0, 100),
    contraband: COMPLETE_ITEMS_URLS.subscription.extraordinary.slice(0, 100),
    exotic: COMPLETE_ITEMS_URLS.subscription.exotic.slice(0, 100)
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

// Функция для обновления весов предметов в БД
async function updateItemWeights() {
  console.log('\n⚖️  Обновляем веса предметов...\n');

  try {
    const items = await db.Item.findAll({
      where: { is_available: true },
      order: [['price', 'DESC']]
    });

    console.log(`📦 Найдено ${items.length} доступных предметов`);

    let updatedCount = 0;
    const significantItems = [];

    for (const item of items) {
      const price = parseFloat(item.price) || 0;
      const correctWeight = calculateCorrectWeightByPrice(price);

      // Обновляем вес в БД
      await item.update({ drop_weight: correctWeight });
      updatedCount++;

      // Собираем информацию о дорогих предметах
      if (price >= 1000) {
        significantItems.push({
          name: item.name.substring(0, 40),
          price: price,
          weight: correctWeight
        });
      }

      // Прогресс
      if (updatedCount % 100 === 0) {
        process.stdout.write(`\r⏳ Обновлено: ${updatedCount}/${items.length}`);
      }
    }

    console.log(`\r✅ Обновлено предметов: ${updatedCount}/${items.length}${' '.repeat(20)}\n`);

    // Показываем примеры дорогих предметов с новыми весами
    if (significantItems.length > 0) {
      console.log('💎 Примеры дорогих предметов с новыми весами:');
      console.log('─'.repeat(80));
      significantItems.slice(0, 10).forEach(item => {
        console.log(`   ${item.name.padEnd(40)} | ${item.price.toFixed(2).padStart(10)}₽ | Вес: ${item.weight.toFixed(4)}`);
      });
      console.log('─'.repeat(80));
    }

    console.log('✅ Веса обновлены по новой улучшенной системе!');
    console.log('💰 Дорогие предметы теперь выпадают в 11-20 раз реже\n');

    return { success: true, updatedCount };
  } catch (error) {
    console.error('❌ Ошибка обновления весов:', error.message);
    return { success: false, error: error.message };
  }
}

// Функция для создания шаблонов кейсов
async function createCaseTemplates() {
  console.log('📦 Создаем шаблоны кейсов...\n');

  const templates = [
    {
      name: 'Ежедневный кейс - Бесплатный',
      description: 'Ежедневный кейс для пользователей без подписки',
      image_url: '/images/cases/free.png',
      type: 'daily',
      min_subscription_tier: 0,
      is_active: true,
      cooldown_hours: 0.003,
      price: null,
      color_scheme: '#4CAF50',
      sort_order: 1
    },
    {
      name: 'Ежедневный кейс - Статус',
      description: 'Ежедневный кейс для подписчиков уровня Статус',
      image_url: '/images/cases/status.png',
      type: 'daily',
      min_subscription_tier: 1,
      is_active: true,
      cooldown_hours: 0.003,
      price: null,
      color_scheme: '#2196F3',
      sort_order: 2
    },
    {
      name: 'Ежедневный кейс - Статус+',
      description: 'Ежедневный кейс для подписчиков уровня Статус+',
      image_url: '/images/cases/+.png',
      type: 'daily',
      min_subscription_tier: 2,
      is_active: true,
      cooldown_hours: 0.003,
      price: null,
      color_scheme: '#9C27B0',
      sort_order: 3
    },
    {
      name: 'Ежедневный кейс - Статус++',
      description: 'Ежедневный кейс для подписчиков уровня Статус++',
      image_url: '/images/cases/++.png',
      type: 'daily',
      min_subscription_tier: 3,
      is_active: true,
      cooldown_hours: 0.003,
      price: null,
      color_scheme: '#673AB7',
      sort_order: 4
    },
    {
      name: 'Бонусный кейс',
      description: 'Кейс, получаемый в бонусной игре',
      image_url: '/images/cases/bonus.png',
      type: 'special',
      min_subscription_tier: 0,
      is_active: true,
      cooldown_hours: 0,
      price: null,
      color_scheme: '#FF5722',
      sort_order: 5
    },
    {
      name: 'Стандартный кейс',
      description: 'Стандартный кейс с хорошими предметами',
      image_url: '/images/cases/99.png',
      type: 'premium',
      min_subscription_tier: 0,
      is_active: true,
      price: 99,
      color_scheme: '#FF9800',
      sort_order: 6
    },
    {
      name: 'Премиум кейс',
      description: 'Премиум кейс с редкими и дорогими предметами',
      image_url: '/images/cases/499.png',
      type: 'premium',
      min_subscription_tier: 0,
      is_active: true,
      price: 499,
      color_scheme: '#F44336',
      sort_order: 7
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

  try {
    const caseTemplates = await db.CaseTemplate.findAll({
      where: { is_active: true }
    });

    // Получаем ВСЕ доступные предметы
    const allItems = await db.Item.findAll({
      where: { is_available: true }
    });

    console.log(`📊 Всего доступных предметов: ${allItems.length}\n`);

    for (const template of caseTemplates) {
      console.log(`🎯 Обрабатываем кейс: ${template.name}`);

      let items = [];

      // Распределяем предметы по кейсам в зависимости от их цены
      // ВАЖНО: Много дешевых предметов + редкие дорогие = правильная рентабельность
      switch(template.name) {
        case 'Ежедневный кейс - Бесплатный':
          // Дешевые предметы (до 50₽) - базовый кейс
          items = allItems.filter(item => item.price <= 50);
          break;

        case 'Ежедневный кейс - Статус':
          // Улучшенная версия: основа до 150₽ + редкие джекпоты до 3000₽
          // Большинство дешевых (вес ~200) + очень редкие дорогие (вес ~4)
          items = allItems.filter(item => item.price <= 3000);
          console.log(`   💎 Добавлено предметов до 150₽: ${allItems.filter(i => i.price <= 150).length}`);
          console.log(`   🎰 Добавлено джекпот-предметов (150₽-3000₽): ${allItems.filter(i => i.price > 150 && i.price <= 3000).length}`);
          break;

        case 'Ежедневный кейс - Статус+':
          // Улучшенная версия: основа до 800₽ + джекпоты до 8000₽
          // Много средних предметов + очень редкие дорогие
          items = allItems.filter(item => item.price <= 8000);
          console.log(`   💎 Добавлено предметов до 800₽: ${allItems.filter(i => i.price <= 800).length}`);
          console.log(`   🎰 Добавлено джекпот-предметов (800₽-8000₽): ${allItems.filter(i => i.price > 800 && i.price <= 8000).length}`);
          break;

        case 'Ежедневный кейс - Статус++':
          // Дорогие предметы (до 5000₽) - премиум подписка
          items = allItems.filter(item => item.price <= 5000);
          break;

        case 'Бонусный кейс':
          // Средние и хорошие предметы (30₽ - 1000₽)
          items = allItems.filter(item => item.price >= 30 && item.price <= 1000);
          break;

        case 'Стандартный кейс':
          // Улучшенная версия для кейса за 99₽: основа 30-500₽ + джекпоты до 10000₽
          // Рентабельность сохраняется за счет весов (дорогие предметы вес ~0.8-2)
          items = allItems.filter(item => item.price >= 30 && item.price <= 10000);
          console.log(`   💎 Добавлено предметов 30-500₽: ${allItems.filter(i => i.price >= 30 && i.price <= 500).length}`);
          console.log(`   🎰 Добавлено джекпот-предметов (500₽-10000₽): ${allItems.filter(i => i.price > 500 && i.price <= 10000).length}`);
          break;

        case 'Премиум кейс':
          // Дорогие предметы (от 100₽) - премиум кейс за 499₽
          items = allItems.filter(item => item.price >= 100);
          break;

        default:
          console.warn(`⚠️ Неизвестный кейс: ${template.name}`);
          continue;
      }

      if (items.length === 0) {
        console.log(`   ❌ Нет предметов для кейса: ${template.name}`);
        continue;
      }

      // Очищаем старые связи и добавляем новые
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

  populateDatabaseOptimized(1000) // Загружаем все предметы (до 1000 на категорию)
    .then(() => {
      console.log('\n🎉 Оптимизированный импорт завершен успешно!');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Ошибка оптимизированного импорта:', error);
      process.exit(1);
    });
}
