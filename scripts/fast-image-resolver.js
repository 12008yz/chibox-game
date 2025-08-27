// Быстрый резолвер изображений для предметов CS2
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Кэш известных URL изображений
const IMAGE_CACHE_FILE = path.join(__dirname, 'image-cache.json');
let imageCache = {};

// Загружаем кэш изображений
function loadImageCache() {
  try {
    if (fs.existsSync(IMAGE_CACHE_FILE)) {
      imageCache = JSON.parse(fs.readFileSync(IMAGE_CACHE_FILE, 'utf8'));
      console.log(`📂 Загружен кэш изображений: ${Object.keys(imageCache).length} записей`);
    }
  } catch (error) {
    console.warn('⚠️ Не удалось загрузить кэш изображений:', error.message);
    imageCache = {};
  }
}

// Сохраняем кэш изображений
function saveImageCache() {
  try {
    fs.writeFileSync(IMAGE_CACHE_FILE, JSON.stringify(imageCache, null, 2));
    console.log(`💾 Кэш изображений сохранен: ${Object.keys(imageCache).length} записей`);
  } catch (error) {
    console.error('❌ Ошибка сохранения кэша изображений:', error.message);
  }
}

// Базовые URL для Steam CDN
const STEAM_CDN_BASES = [
  'https://community.cloudflare.steamstatic.com/economy/image/',
  'https://steamcommunity-a.akamaihd.net/economy/image/',
  'https://cdn.cloudflare.steamstatic.com/economy/image/'
];

// Паттерны для генерации ID изображений
const WEAPON_PATTERNS = {
  'AK-47': 'ak47',
  'M4A4': 'm4a4',
  'M4A1-S': 'm4a1_silencer',
  'AWP': 'awp',
  'Desert Eagle': 'deagle',
  'Glock-18': 'glock',
  'USP-S': 'usp_silencer',
  'P250': 'p250',
  'Five-SeveN': 'fiveseven',
  'Tec-9': 'tec9',
  'CZ75-Auto': 'cz75a',
  'Dual Berettas': 'elite',
  'P2000': 'hkp2000',
  'R8 Revolver': 'revolver',
  'MP9': 'mp9',
  'MAC-10': 'mac10',
  'MP7': 'mp7',
  'UMP-45': 'ump45',
  'P90': 'p90',
  'PP-Bizon': 'bizon',
  'MP5-SD': 'mp5sd',
  'Nova': 'nova',
  'XM1014': 'xm1014',
  'Sawed-Off': 'sawedoff',
  'MAG-7': 'mag7',
  'Negev': 'negev',
  'M249': 'm249',
  'FAMAS': 'famas',
  'Galil AR': 'galilar',
  'AUG': 'aug',
  'SG 553': 'sg556',
  'SCAR-20': 'scar20',
  'G3SG1': 'g3sg1',
  'SSG 08': 'ssg08'
};

// Быстрое получение изображения предмета
async function getItemImageFast(marketHashName, useCache = true) {
  try {
    // Проверяем кэш
    if (useCache && imageCache[marketHashName]) {
      const cachedUrl = imageCache[marketHashName];
      if (await validateImageUrl(cachedUrl)) {
        console.log(`📋 Изображение из кэша: ${marketHashName}`);
        return cachedUrl;
      } else {
        // Удаляем неработающую ссылку из кэша
        delete imageCache[marketHashName];
      }
    }

    console.log(`🔍 Получаем изображение для: ${marketHashName}`);

    // Стратегия 1: Поиск через Steam Market API
    const marketImageUrl = await getImageFromMarketAPI(marketHashName);
    if (marketImageUrl) {
      imageCache[marketHashName] = marketImageUrl;
      saveImageCache();
      return marketImageUrl;
    }

    // Стратегия 2: Генерация URL на основе паттернов
    const generatedImageUrl = generateImageUrl(marketHashName);
    if (generatedImageUrl && await validateImageUrl(generatedImageUrl)) {
      imageCache[marketHashName] = generatedImageUrl;
      saveImageCache();
      return generatedImageUrl;
    }

    // Стратегия 3: Поиск в Steam Inventory API
    const inventoryImageUrl = await getImageFromInventoryAPI(marketHashName);
    if (inventoryImageUrl) {
      imageCache[marketHashName] = inventoryImageUrl;
      saveImageCache();
      return inventoryImageUrl;
    }

    console.log(`❌ Не удалось получить изображение для: ${marketHashName}`);
    return null;

  } catch (error) {
    console.error(`❌ Ошибка получения изображения для ${marketHashName}:`, error.message);
    return null;
  }
}

// Получение изображения через Steam Market API
async function getImageFromMarketAPI(marketHashName) {
  try {
    const encodedName = encodeURIComponent(marketHashName);
    const apiUrl = `https://steamcommunity.com/market/search/render/?appid=730&search_descriptions=0&sort_column=popular&sort_dir=desc&count=1&query=${encodedName}`;

    const response = await axios.get(apiUrl, {
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      }
    });

    if (response.data && response.data.results_html) {
      // Парсим HTML результата поиска
      const htmlMatch = response.data.results_html.match(/src="([^"]+)"/);
      if (htmlMatch && htmlMatch[1]) {
        const imageUrl = htmlMatch[1].replace(/\/62fx62f/, '/360fx360f'); // Получаем изображение высокого разрешения
        console.log(`✅ Изображение получено через Market API: ${imageUrl}`);
        return imageUrl;
      }
    }

    return null;
  } catch (error) {
    console.log(`⚠️ Market API не сработал: ${error.message}`);
    return null;
  }
}

// Генерация URL изображения на основе паттернов
function generateImageUrl(marketHashName) {
  try {
    // Извлекаем информацию о предмете
    const parts = marketHashName.split(' | ');
    if (parts.length < 2) return null;

    const weaponName = parts[0].trim();
    const skinNameWithExterior = parts[1].trim();

    // Убираем состояние из названия скина
    const skinName = skinNameWithExterior.replace(/\s*\([^)]*\)\s*$/, '').trim();

    // Получаем внутреннее имя оружия
    const weaponKey = WEAPON_PATTERNS[weaponName];
    if (!weaponKey) return null;

    // Генерируем возможные ID для изображения
    const skinKey = skinName.toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '_')
      .replace(/-/g, '_');

    // Пробуем различные форматы ID
    const possibleIds = [
      `${weaponKey}_${skinKey}`,
      `weapon_${weaponKey}_${skinKey}`,
      `${weaponKey}_${skinKey}_light_large`,
      `${weaponKey}_${skinKey}_medium`
    ];

    // Пробуем разные базовые URL
    for (const baseUrl of STEAM_CDN_BASES) {
      for (const id of possibleIds) {
        const imageUrl = `${baseUrl}${id}/360fx360f.jpg`;
        // Возвращаем первый сгенерированный URL для проверки
        return imageUrl;
      }
    }

    return null;
  } catch (error) {
    console.log(`⚠️ Ошибка генерации URL: ${error.message}`);
    return null;
  }
}

// Получение изображения через Inventory API
async function getImageFromInventoryAPI(marketHashName) {
  try {
    const encodedName = encodeURIComponent(marketHashName);
    const inventoryUrl = `https://steamcommunity.com/market/listings/730/${encodedName}`;

    const response = await axios.get(inventoryUrl, {
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html'
      }
    });

    if (response.data) {
      // Ищем изображение в HTML страницы
      const imageMatches = response.data.match(/https:\/\/[^"]*economy\/image\/[^"]*\/360fx360f[^"]*/g);

      if (imageMatches && imageMatches.length > 0) {
        const imageUrl = imageMatches[0];
        console.log(`✅ Изображение получено через Inventory API: ${imageUrl}`);
        return imageUrl;
      }
    }

    return null;
  } catch (error) {
    console.log(`⚠️ Inventory API не сработал: ${error.message}`);
    return null;
  }
}

// Валидация URL изображения
async function validateImageUrl(url) {
  try {
    const response = await axios.head(url, { timeout: 3000 });
    return response.status === 200 && response.headers['content-type']?.startsWith('image/');
  } catch (error) {
    return false;
  }
}

// Массовое получение изображений
async function batchGetImages(marketHashNames, batchSize = 10) {
  console.log(`🔄 Массовое получение изображений для ${marketHashNames.length} предметов`);

  loadImageCache();

  const results = {};

  for (let i = 0; i < marketHashNames.length; i += batchSize) {
    const batch = marketHashNames.slice(i, i + batchSize);
    console.log(`📦 Обрабатываем батч ${Math.floor(i/batchSize) + 1}/${Math.ceil(marketHashNames.length/batchSize)}`);

    const batchPromises = batch.map(async (name) => {
      const imageUrl = await getItemImageFast(name, true);
      return { name, imageUrl };
    });

    const batchResults = await Promise.allSettled(batchPromises);

    batchResults.forEach((result) => {
      if (result.status === 'fulfilled') {
        const { name, imageUrl } = result.value;
        results[name] = imageUrl;
      }
    });

    // Пауза между батчами
    if (i + batchSize < marketHashNames.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  saveImageCache();

  const successCount = Object.values(results).filter(url => url !== null).length;
  console.log(`✅ Получено изображений: ${successCount}/${marketHashNames.length}`);

  return results;
}

// Экспорт функций
module.exports = {
  getItemImageFast,
  batchGetImages,
  loadImageCache,
  saveImageCache,
  validateImageUrl
};

// Запуск если вызван напрямую
if (require.main === module) {
  console.log('🚀 Тестируем быстрое получение изображений...');

  const testItems = [
    'AK-47 | Redline (Field-Tested)',
    'M4A4 | Howl (Factory New)',
    'AWP | Dragon Lore (Factory New)'
  ];

  (async () => {
    const results = await batchGetImages(testItems);
    console.log('📊 Результаты тестирования:');
    console.log(JSON.stringify(results, null, 2));
  })();
}
