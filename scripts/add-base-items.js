const axios = require('axios');
const fs = require('fs');
const db = require('../models');

// Импортируем функции для получения данных с Steam
const { getSteamItemData, getSteamItemsBatch, testSteamAPI } = require('./steam-item-fetcher');

// Импортируем полный список URLs
const COMPLETE_ITEMS_URLS = require('../utils/linkItems-complete');

// Импортируем калькулятор весов дропа
const {
  calculateModifiedDropWeights,
  getWeightDistributionStats,
  getPriceCategory
} = require('../utils/dropWeightCalculator');

// Функция для извлечения market_hash_name из URL
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

// Конфигурация кейсов с точными весами для рентабельности 20%
const CASE_CONFIGS = {
  subscription_tier1: {
    name: 'Подписочные кейсы (Уровень 1)',
    target_expected_value: 35, // в рублях - увеличено для привлекательности
    min_subscription_tier: 1,
    drop_weights: {
      consumer: 500,    // 50%
      industrial: 300,  // 30%
      milspec: 150,     // 15%
      restricted: 40,   // 4%
      classified: 10    // 1% - добавляем дорогие предметы!
    }
  },
  subscription_tier2: {
    name: 'Подписочные кейсы (Уровень 2)',
    target_expected_value: 55, // в рублях
    min_subscription_tier: 2,
    drop_weights: {
      consumer: 400,    // 40%
      industrial: 300,  // 30%
      milspec: 200,     // 20%
      restricted: 80,   // 8%
      classified: 20    // 2% - больше дорогих предметов
    }
  },
  subscription_tier3: {
    name: 'Подписочные кейсы (Уровень 3)',
    target_expected_value: 85, // в рублях
    min_subscription_tier: 3,
    drop_weights: {
      consumer: 300,    // 30%
      industrial: 250,  // 25%
      milspec: 250,     // 25%
      restricted: 150,  // 15%
      classified: 40,   // 4%
      covert: 10        // 1% - редкие предметы для VIP!
    }
  },
  purchase: {
    name: 'Покупные кейсы ₽99',
    target_expected_value: 79, // в рублях
    price: 99, // в рублях
    min_subscription_tier: 0,
    drop_weights: {
      consumer: 600,     // 60%
      industrial: 250,   // 25%
      milspec: 100,      // 10%
      restricted: 40,    // 4%
      classified: 8,     // 0.8%
      covert: 1.5,       // 0.15%
      contraband: 0.5    // 0.05% (вместо knives_budget)
    }
  },
  premium: {
    name: 'Премиум кейсы ₽499',
    target_expected_value: 399, // в рублях
    price: 499, // в рублях
    min_subscription_tier: 0,
    drop_weights: {
      milspec: 400,     // 40%
      restricted: 350,  // 35%
      classified: 150,  // 15%
      covert: 70,       // 7%
      contraband: 25,   // 2.5% (ножи - используем contraband)
      exotic: 5         // 0.5% (перчатки - используем exotic)
    }
  }
};

// Списки URL для каждого типа кейса
const ITEMS_URLS = {
  // Подписочные кейсы теперь включают все уровни редкости
  subscription_tier1: {
    consumer: [
      'https://steamcommunity.com/market/listings/730/AK-47%20%7C%20Safari%20Mesh%20%28Battle-Scarred%29',
      'https://steamcommunity.com/market/listings/730/AK-47%20%7C%20Forest%20DDPAT%20%28Battle-Scarred%29',
      'https://steamcommunity.com/market/listings/730/M4A4%20%7C%20Urban%20DDPAT%20%28Battle-Scarred%29',
      'https://steamcommunity.com/market/listings/730/M4A1-S%20%7C%20Boreal%20Forest%20%28Battle-Scarred%29',
      'https://steamcommunity.com/market/listings/730/AWP%20%7C%20Safari%20Mesh%20%28Battle-Scarred%29',
      'https://steamcommunity.com/market/listings/730/Glock-18%20%7C%20Forest%20DDPAT%20%28Battle-Scarred%29',
      'https://steamcommunity.com/market/listings/730/USP-S%20%7C%20Forest%20Leaves%20%28Battle-Scarred%29',
      'https://steamcommunity.com/market/listings/730/P250%20%7C%20Sand%20Dune%20%28Factory%20New%29',
      'https://steamcommunity.com/market/listings/730/MAC-10%20%7C%20Urban%20DDPAT%20%28Battle-Scarred%29',
      'https://steamcommunity.com/market/listings/730/Nova%20%7C%20Forest%20Leaves%20%28Battle-Scarred%29',
      'https://steamcommunity.com/market/listings/730/P90%20%7C%20Sand%20Spray%20%28Battle-Scarred%29',
      'https://steamcommunity.com/market/listings/730/MP9%20%7C%20Sand%20Dashed%20%28Battle-Scarred%29',
      'https://steamcommunity.com/market/listings/730/PP-Bizon%20%7C%20Forest%20Leaves%20%28Battle-Scarred%29',
      'https://steamcommunity.com/market/listings/730/UMP-45%20%7C%20Urban%20DDPAT%20%28Battle-Scarred%29',
      'https://steamcommunity.com/market/listings/730/SCAR-20%20%7C%20Sand%20Mesh%20%28Battle-Scarred%29'
    ],
    industrial: [
      'https://steamcommunity.com/market/listings/730/AK-47%20%7C%20Blue%20Laminate%20%28Well-Worn%29',
      'https://steamcommunity.com/market/listings/730/M4A4%20%7C%20Faded%20Zebra%20%28Field-Tested%29',
      'https://steamcommunity.com/market/listings/730/M4A1-S%20%7C%20Bright%20Water%20%28Field-Tested%29',
      'https://steamcommunity.com/market/listings/730/Glock-18%20%7C%20Blue%20Fissure%20%28Factory%20New%29',
      'https://steamcommunity.com/market/listings/730/USP-S%20%7C%20Stainless%20%28Factory%20New%29',
      'https://steamcommunity.com/market/listings/730/Five-SeveN%20%7C%20Silver%20Quartz%20%28Factory%20New%29',
      'https://steamcommunity.com/market/listings/730/Tec-9%20%7C%20Brass%20%28Factory%20New%29',
      'https://steamcommunity.com/market/listings/730/P2000%20%7C%20Silver%20%28Factory%20New%29',
      'https://steamcommunity.com/market/listings/730/Dual%20Berettas%20%7C%20Contractor%20%28Factory%20New%29',
      'https://steamcommunity.com/market/listings/730/CZ75-Auto%20%7C%20Silver%20%28Factory%20New%29'
    ],
    milspec: [
      'https://steamcommunity.com/market/listings/730/AK-47%20%7C%20Blue%20Laminate%20%28Field-Tested%29',
      'https://steamcommunity.com/market/listings/730/M4A1-S%20%7C%20Guardian%20%28Well-Worn%29',
      'https://steamcommunity.com/market/listings/730/Glock-18%20%7C%20Water%20Elemental%20%28Well-Worn%29',
      'https://steamcommunity.com/market/listings/730/P250%20%7C%20Asiimov%20%28Well-Worn%29',
      'https://steamcommunity.com/market/listings/730/FAMAS%20%7C%20Djinn%20%28Field-Tested%29',
      // Добавьте остальные 55 Mil-Spec Grade URL...
    ],
    restricted: [
      'https://steamcommunity.com/market/listings/730/AK-47%20%7C%20Phantom%20Disruptor%20%28Battle-Scarred%29',
      'https://steamcommunity.com/market/listings/730/M4A1-S%20%7C%20Hyper%20Beast%20%28Battle-Scarred%29',
      'https://steamcommunity.com/market/listings/730/Glock-18%20%7C%20Fade%20%28Battle-Scarred%29',
      'https://steamcommunity.com/market/listings/730/USP-S%20%7C%20Kill%20Confirmed%20%28Battle-Scarred%29',
      'https://steamcommunity.com/market/listings/730/FAMAS%20%7C%20Roll%20Cage%20%28Field-Tested%29'
    ],
    classified: [
      'https://steamcommunity.com/market/listings/730/AK-47%20%7C%20Redline%20%28Battle-Scarred%29',
      'https://steamcommunity.com/market/listings/730/M4A4%20%7C%20Asiimov%20%28Battle-Scarred%29',
      'https://steamcommunity.com/market/listings/730/AWP%20%7C%20Redline%20%28Battle-Scarred%29'
    ]
  },

  // Уровень 2 подписки - те же предметы но больше classified
  subscription_tier2: {
    consumer: [
      'https://steamcommunity.com/market/listings/730/AK-47%20%7C%20Safari%20Mesh%20%28Battle-Scarred%29',
      'https://steamcommunity.com/market/listings/730/AK-47%20%7C%20Forest%20DDPAT%20%28Battle-Scarred%29',
      'https://steamcommunity.com/market/listings/730/M4A4%20%7C%20Urban%20DDPAT%20%28Battle-Scarred%29'
    ],
    industrial: [
      'https://steamcommunity.com/market/listings/730/AK-47%20%7C%20Blue%20Laminate%20%28Well-Worn%29',
      'https://steamcommunity.com/market/listings/730/M4A4%20%7C%20Faded%20Zebra%20%28Field-Tested%29',
      'https://steamcommunity.com/market/listings/730/M4A1-S%20%7C%20Bright%20Water%20%28Field-Tested%29'
    ],
    milspec: [
      'https://steamcommunity.com/market/listings/730/AK-47%20%7C%20Blue%20Laminate%20%28Field-Tested%29',
      'https://steamcommunity.com/market/listings/730/M4A1-S%20%7C%20Guardian%20%28Well-Worn%29',
      'https://steamcommunity.com/market/listings/730/Glock-18%20%7C%20Water%20Elemental%20%28Well-Worn%29'
    ],
    restricted: [
      'https://steamcommunity.com/market/listings/730/AK-47%20%7C%20Phantom%20Disruptor%20%28Battle-Scarred%29',
      'https://steamcommunity.com/market/listings/730/M4A1-S%20%7C%20Hyper%20Beast%20%28Battle-Scarred%29',
      'https://steamcommunity.com/market/listings/730/Glock-18%20%7C%20Fade%20%28Battle-Scarred%29'
    ],
    classified: [
      'https://steamcommunity.com/market/listings/730/AK-47%20%7C%20Redline%20%28Battle-Scarred%29',
      'https://steamcommunity.com/market/listings/730/M4A4%20%7C%20Asiimov%20%28Battle-Scarred%29',
      'https://steamcommunity.com/market/listings/730/AWP%20%7C%20Redline%20%28Battle-Scarred%29'
    ]
  },

  // Уровень 3 подписки - добавляем covert предметы!
  subscription_tier3: {
    consumer: [
      'https://steamcommunity.com/market/listings/730/AK-47%20%7C%20Safari%20Mesh%20%28Battle-Scarred%29',
      'https://steamcommunity.com/market/listings/730/AK-47%20%7C%20Forest%20DDPAT%20%28Battle-Scarred%29',
      'https://steamcommunity.com/market/listings/730/M4A4%20%7C%20Urban%20DDPAT%20%28Battle-Scarred%29'
    ],
    industrial: [
      'https://steamcommunity.com/market/listings/730/AK-47%20%7C%20Blue%20Laminate%20%28Well-Worn%29',
      'https://steamcommunity.com/market/listings/730/M4A4%20%7C%20Faded%20Zebra%20%28Field-Tested%29',
      'https://steamcommunity.com/market/listings/730/M4A1-S%20%7C%20Bright%20Water%20%28Field-Tested%29'
    ],
    milspec: [
      'https://steamcommunity.com/market/listings/730/AK-47%20%7C%20Blue%20Laminate%20%28Field-Tested%29',
      'https://steamcommunity.com/market/listings/730/M4A1-S%20%7C%20Guardian%20%28Well-Worn%29',
      'https://steamcommunity.com/market/listings/730/Glock-18%20%7C%20Water%20Elemental%20%28Well-Worn%29'
    ],
    restricted: [
      'https://steamcommunity.com/market/listings/730/AK-47%20%7C%20Phantom%20Disruptor%20%28Battle-Scarred%29',
      'https://steamcommunity.com/market/listings/730/M4A1-S%20%7C%20Hyper%20Beast%20%28Battle-Scarred%29',
      'https://steamcommunity.com/market/listings/730/Glock-18%20%7C%20Fade%20%28Battle-Scarred%29'
    ],
    classified: [
      'https://steamcommunity.com/market/listings/730/AK-47%20%7C%20Redline%20%28Battle-Scarred%29',
      'https://steamcommunity.com/market/listings/730/M4A4%20%7C%20Asiimov%20%28Battle-Scarred%29',
      'https://steamcommunity.com/market/listings/730/AWP%20%7C%20Redline%20%28Battle-Scarred%29'
    ],
    covert: [
      'https://steamcommunity.com/market/listings/730/AK-47%20%7C%20Hydroponic%20%28Battle-Scarred%29',
      'https://steamcommunity.com/market/listings/730/M4A1-S%20%7C%20Hot%20Rod%20%28Battle-Scarred%29'
    ]
  },

  purchase: {
    // Используем те же consumer, industrial, milspec, restricted как в подписочных
    // Плюс добавляем дорогие:
    classified: [
      'https://steamcommunity.com/market/listings/730/AK-47%20%7C%20Redline%20%28Battle-Scarred%29',
      'https://steamcommunity.com/market/listings/730/M4A4%20%7C%20Asiimov%20%28Battle-Scarred%29',
      'https://steamcommunity.com/market/listings/730/AWP%20%7C%20Redline%20%28Battle-Scarred%29',
      'https://steamcommunity.com/market/listings/730/Desert%20Eagle%20%7C%20Blaze%20%28Battle-Scarred%29',
      'https://steamcommunity.com/market/listings/730/P90%20%7C%20Asiimov%20%28Factory%20New%29',
      // Добавьте остальные 10 Classified URL...
    ],
    covert: [
      'https://steamcommunity.com/market/listings/730/AK-47%20%7C%20Hydroponic%20%28Battle-Scarred%29',
      'https://steamcommunity.com/market/listings/730/M4A1-S%20%7C%20Hot%20Rod%20%28Battle-Scarred%29',
      'https://steamcommunity.com/market/listings/730/AWP%20%7C%20Lightning%20Strike%20%28Factory%20New%29',
      'https://steamcommunity.com/market/listings/730/Desert%20Eagle%20%7C%20Printstream%20%28Battle-Scarred%29',
      'https://steamcommunity.com/market/listings/730/Glock-18%20%7C%20Fade%20%28Factory%20New%29',
      // Добавьте остальные 3 Covert URL...
    ],
    contraband: [
      'https://steamcommunity.com/market/listings/730/%E2%98%85%20Gut%20Knife%20%7C%20Safari%20Mesh%20%28Battle-Scarred%29',
      'https://steamcommunity.com/market/listings/730/%E2%98%85%20Navaja%20Knife%20%7C%20Urban%20Masked%20%28Well-Worn%29',
      'https://steamcommunity.com/market/listings/730/%E2%98%85%20Falchion%20Knife%20%7C%20Forest%20DDPAT%20%28Field-Tested%29',
      'https://steamcommunity.com/market/listings/730/%E2%98%85%20Shadow%20Daggers%20%7C%20Safari%20Mesh%20%28Battle-Scarred%29',
      'https://steamcommunity.com/market/listings/730/%E2%98%85%20Paracord%20Knife%20%7C%20Safari%20Mesh%20%28Field-Tested%29'
    ]
  },

  premium: {
    contraband: [
      'https://steamcommunity.com/market/listings/730/%E2%98%85%20Flip%20Knife%20%7C%20Damascus%20Steel%20%28Field-Tested%29',
      'https://steamcommunity.com/market/listings/730/%E2%98%85%20Huntsman%20Knife%20%7C%20Case%20Hardened%20%28Factory%20New%29',
      'https://steamcommunity.com/market/listings/730/%E2%98%85%20Karambit%20%7C%20Doppler%20%28Factory%20New%29',
      'https://steamcommunity.com/market/listings/730/%E2%98%85%20Butterfly%20Knife%20%7C%20Tiger%20Tooth%20%28Factory%20New%29',
      'https://steamcommunity.com/market/listings/730/%E2%98%85%20M9%20Bayonet%20%7C%20Fade%20%28Factory%20New%29',
      // Добавьте остальные 10 Premium Knives URL...
    ],
    exotic: [
      'https://steamcommunity.com/market/listings/730/%E2%98%85%20Bloodhound%20Gloves%20%7C%20Charred%20%28Field-Tested%29',
      'https://steamcommunity.com/market/listings/730/%E2%98%85%20Driver%20Gloves%20%7C%20Racing%20Green%20%28Field-Tested%29',
      'https://steamcommunity.com/market/listings/730/%E2%98%85%20Hand%20Wraps%20%7C%20Slaughter%20%28Field-Tested%29',
      'https://steamcommunity.com/market/listings/730/%E2%98%85%20Specialist%20Gloves%20%7C%20Crimson%20Kimono%20%28Field-Tested%29',
      'https://steamcommunity.com/market/listings/730/%E2%98%85%20Sport%20Gloves%20%7C%20Pandora%27s%20Box%20%28Field-Tested%29',
      // Добавьте остальные 3 Gloves URL...
    ]
  }
};

// Функция для определения редкости по цене (для автоматической классификации)
function determineRarityByPrice(price) {
  if (price >= 50000) return 'exotic';      // $500+
  if (price >= 10000) return 'covert';      // $100+
  if (price >= 1000) return 'classified';   // $10+
  if (price >= 200) return 'restricted';    // $2+
  if (price >= 50) return 'milspec';        // $0.50+
  if (price >= 10) return 'industrial';     // $0.10+
  return 'consumer';                        // < $0.10
}

// Функция для обработки одного предмета
async function processItem(url, rarity, caseType, delay = 2000) {
  try {
    console.log(`🔄 Обрабатываем: ${url}`);

    const marketHashName = extractMarketHashNameFromUrl(url);
    if (!marketHashName) {
      console.error(`❌ Не удалось извлечь имя из URL: ${url}`);
      return null;
    }

    // Проверяем, существует ли уже такой предмет
    const existingItem = await db.Item.findOne({
      where: { steam_market_hash_name: marketHashName }
    });

    if (existingItem) {
      console.log(`⏭️  Предмет уже существует: ${marketHashName}`);
      return existingItem;
    }

    // Добавляем задержку
    await new Promise(resolve => setTimeout(resolve, delay));

    // Получаем данные с Steam с повторными попытками
    let steamData = null;
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts && !steamData) {
      attempts++;
      try {
        console.log(`   Попытка ${attempts}/${maxAttempts} получения данных Steam...`);
        steamData = await getSteamItemData(marketHashName);

        if (steamData && !steamData.error) {
          break;
        } else if (steamData && steamData.error) {
          console.warn(`   ⚠️ Попытка ${attempts} неудачна: ${steamData.error}`);
        }
      } catch (error) {
        console.warn(`   ⚠️ Ошибка попытки ${attempts}: ${error.message}`);
      }

      // Дополнительная задержка между попытками
      if (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    if (!steamData || steamData.error) {
      console.error(`❌ Не удалось получить данные после ${maxAttempts} попыток: ${marketHashName}`);
      return null;
    }

    // Извлекаем основную информацию и конвертируем в рубли
    const priceUsd = steamData.price_usd || 0.10;
    const exchangeRate = 95; // USD to RUB exchange rate
    const priceRub = Math.round(priceUsd * exchangeRate * 100) / 100; // Цена в рублях
    const autoRarity = determineRarityByPrice(priceUsd * 100); // Определяем редкость по цене в центах
    const finalRarity = rarity || autoRarity;

    // Определяем drop_weight на основе редкости и цены
    let dropWeight = 1;
    const config = CASE_CONFIGS[caseType];
    if (config && config.drop_weights[finalRarity]) {
      // Базовый вес для данной редкости, с небольшой рандомизацией
      const baseWeight = config.drop_weights[finalRarity];
      dropWeight = baseWeight + (Math.random() - 0.5) * baseWeight * 0.2; // ±10% вариация
    }

    // Извлекаем детали предмета
    const weaponType = extractWeaponType(marketHashName);
    const skinName = extractSkinName(marketHashName);
    const exterior = extractExterior(marketHashName);

    // Создаем запись в базе данных
    const newItem = await db.Item.create({
      name: marketHashName,
      description: `CS2 ${finalRarity} skin: ${marketHashName}`,
      image_url: steamData.item_info?.icon_url_large || steamData.item_info?.icon_url || null,
      price: priceRub, // Цена в рублях
      rarity: finalRarity,
      drop_weight: Math.round(dropWeight * 100) / 100,
      min_subscription_tier: CASE_CONFIGS[caseType]?.min_subscription_tier || 0,
      weapon_type: weaponType,
      skin_name: skinName,
      steam_market_hash_name: marketHashName,
      is_available: true,
      exterior: exterior,
      quality: extractQuality(marketHashName),
      in_stock: false,
      is_tradable: true,
      float_value: null,
      stickers: null,
      origin: `${caseType}_case`
    });

    console.log(`✅ Добавлен: ${marketHashName} - ₽${priceRub} (${priceUsd}) - ${finalRarity} - weight: ${Math.round(dropWeight * 100) / 100}`);
    return newItem;

  } catch (error) {
    console.error(`❌ Критическая ошибка обработки ${url}:`, error.message);
    return null;
  }
}

// Вспомогательные функции для извлечения данных
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
      cooldown_hours: 24,
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
      cooldown_hours: 24,
      price: null,
      color_scheme: '#2196F3',
      sort_order: 2
    },
    {
      name: 'Ежедневный кейс (Уровень 3)',
      description: 'Премиум ежедневный кейс для подписчиков 3 уровня с защитой от дубликатов',
      type: 'daily',
      min_subscription_tier: 3,
      is_active: true,
      cooldown_hours: 24,
      price: null,
      color_scheme: '#9C27B0',
      sort_order: 3
    },
    {
      name: 'Покупной кейс',
      description: 'Кейс с повышенными шансами на редкие предметы',
      type: 'premium',
      min_subscription_tier: 0,
      is_active: true,
      price: 99, // 99 рублей
      color_scheme: '#FF9800',
      sort_order: 4
    },
    {
      name: 'Премиум кейс',
      description: 'Эксклюзивный кейс с ножами и перчатками',
      type: 'special',
      min_subscription_tier: 0,
      is_active: true,
      price: 499, // 499 рублей
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
        console.log(`⏭️  Шаблон уже существует: ${template.name}`);
      }
    } catch (error) {
      console.error(`❌ Ошибка создания шаблона ${template.name}:`, error.message);
    }
  }

  return createdTemplates;
}

// Основная функция для наполнения базы данных
async function populateDatabase(limitPerCategory = 5) {
  console.log('🚀 Начинаем наполнение базы данных предметами CS2...\n');

  let totalItems = 0;
  let successfulItems = 0;

  // Создаем шаблоны кейсов
  await createCaseTemplates();

  // Обрабатываем предметы для каждого типа кейса
  for (const [caseType, categories] of Object.entries(ITEMS_URLS)) {
    console.log(`\n📦 Обрабатываем кейс: ${CASE_CONFIGS[caseType]?.name || caseType}`);

    for (const [rarity, urls] of Object.entries(categories)) {
      console.log(`\n🎯 Редкость: ${rarity} (${urls.length} предметов)`);

      // Ограничиваем количество для тестирования
      const urlsToProcess = urls.slice(0, limitPerCategory);

      for (let i = 0; i < urlsToProcess.length; i++) {
        const url = urlsToProcess[i];
        console.log(`[${i + 1}/${urlsToProcess.length}] Обрабатываем: ${rarity}`);

        const result = await processItem(url, rarity, caseType, 3000);
        totalItems++;

        if (result) {
          successfulItems++;
        }

        // Увеличенная задержка между запросами для Steam API
        if (i < urlsToProcess.length - 1) {
          console.log('⏳ Ждем 3 секунды перед следующим запросом...');
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
    }
  }

  console.log('\n🎉 Наполнение базы данных завершено!');
  console.log(`📊 Статистика:`);
  console.log(`- Всего обработано: ${totalItems}`);
  console.log(`- Успешно добавлено: ${successfulItems}`);
  console.log(`- Ошибок: ${totalItems - successfulItems}`);

  // Проверяем рентабельность
  await validateProfitability();

  // Связываем предметы с шаблонами кейсов
  await linkItemsToCaseTemplates();

  // Пересчитываем веса дропа с помощью dropWeightCalculator
  await recalculateDropWeights();

}

// Функция для проверки рентабельности
async function validateProfitability() {
  console.log('\n💰 ПРОВЕРКА РЕНТАБЕЛЬНОСТИ:\n');

  for (const [caseType, config] of Object.entries(CASE_CONFIGS)) {
    console.log(`📦 ${config.name}:`);

    // Получаем все предметы для данного типа кейса
    const items = await db.Item.findAll({
      where: { origin: `${caseType}_case` }
    });

    if (items.length === 0) {
      console.log('   ❌ Нет предметов для расчета\n');
      continue;
    }

    // Рассчитываем ожидаемую стоимость
    let expectedValue = 0;
    let totalWeight = 0;

    // Группируем по редкости
    const itemsByRarity = {};
    items.forEach(item => {
      if (!itemsByRarity[item.rarity]) {
        itemsByRarity[item.rarity] = [];
      }
      itemsByRarity[item.rarity].push(item);
    });

    // Рассчитываем для каждой редкости
    Object.keys(config.drop_weights).forEach(rarity => {
      const weight = config.drop_weights[rarity];
      const rarityItems = itemsByRarity[rarity] || [];

      if (rarityItems.length > 0) {
        const avgPrice = rarityItems.reduce((sum, item) => sum + (parseFloat(item.price) || 0), 0) / rarityItems.length;
        const contribution = (weight / 1000) * avgPrice;
        expectedValue += contribution;
        totalWeight += weight;

        console.log(`   ${rarity}: ${rarityItems.length} предметов, вес: ${weight}, средняя цена: ₽${avgPrice.toFixed(2)}, вклад: ₽${contribution.toFixed(2)}`);
      }
    });

    console.log(`   Ожидаемая стоимость: ₽${expectedValue.toFixed(2)}`);
    console.log(`   Целевая стоимость: ₽${config.target_expected_value}`);

    if (config.price) {
      const profit = config.price - expectedValue;
      const profitability = (profit / config.price * 100);
      console.log(`   Цена кейса: ₽${config.price}`);
      console.log(`   Прибыль: ₽${profit.toFixed(2)}`);
      console.log(`   Рентабельность: ${profitability.toFixed(1)}%`);
      console.log(`   Статус: ${profitability >= 18 && profitability <= 25 ? '✅ ОПТИМАЛЬНО' : profitability >= 15 ? '⚠️  ПРИЕМЛЕМО' : '❌ УБЫТОЧНО'}`);
    } else {
      console.log(`   Статус: ${expectedValue <= config.target_expected_value ? '✅ СООТВЕТСТВУЕТ' : '❌ ПРЕВЫШАЕТ ЛИМИТ'}`);
    }
    console.log('');
  }
}

// Функция для связывания предметов с шаблонами кейсов
async function linkItemsToCaseTemplates() {
  console.log('\n🔗 Связываем предметы с шаблонами кейсов...\n');

  // Конфигурация соответствия кейсов и их origin
  const CASE_ITEM_MAPPING = {
    'Ежедневный кейс (Уровень 1)': 'subscription_tier1_case',
    'Ежедневный кейс (Уровень 2)': 'subscription_tier2_case',
    'Ежедневный кейс (Уровень 3)': 'subscription_tier3_case',
    'Покупной кейс': 'purchase_case',
    'Премиум кейс': 'premium_case'
  };

  try {
    const caseTemplates = await db.CaseTemplate.findAll({
      where: { is_active: true }
    });

    for (const template of caseTemplates) {
      console.log(`🎯 Обрабатываем кейс: ${template.name}`);

      // Определяем origin для данного кейса
      let originPattern = CASE_ITEM_MAPPING[template.name];

      if (!originPattern) {
        if (template.name.includes('Ежедневный') || template.type === 'daily') {
          // Определяем уровень подписки из названия
          if (template.name.includes('Уровень 1')) {
            originPattern = 'subscription_tier1_case';
          } else if (template.name.includes('Уровень 2')) {
            originPattern = 'subscription_tier2_case';
          } else if (template.name.includes('Уровень 3')) {
            originPattern = 'subscription_tier3_case';
          } else {
            originPattern = 'subscription_tier1_case'; // fallback
          }
        } else if (template.name.includes('Покупной') || (template.price && template.price <= 150)) {
          originPattern = 'purchase_case';
        } else if (template.name.includes('Премиум') || (template.price && template.price > 150)) {
          originPattern = 'premium_case';
        }
      }

      if (!originPattern) {
        console.warn(`⚠️  Не удалось определить тип для кейса: ${template.name}`);
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

      // Очищаем текущие связи и добавляем новые
      await template.setItems([]);
      await template.addItems(items);

      console.log(`   ✅ Связано ${items.length} предметов с кейсом: ${template.name}`);
    }

    console.log('\n🎉 Связывание завершено успешно!');
  } catch (error) {
    console.error('❌ Ошибка при связывании предметов с кейсами:', error);
  }
}

// Функция для пересчета весов дропа с использованием dropWeightCalculator
async function recalculateDropWeights() {
  console.log('\n⚖️  ПЕРЕСЧЕТ ВЕСОВ ДРОПА С ПОМОЩЬЮ DROPWEIGHTCALCULATOR:\n');

  try {
    // Получаем все предметы из базы данных
    const allItems = await db.Item.findAll({
      where: { is_available: true }
    });

    if (allItems.length === 0) {
      console.log('❌ Нет предметов для пересчета весов');
      return;
    }

    console.log(`📊 Найдено ${allItems.length} предметов для анализа\n`);

    // Группируем предметы по типу кейса (origin)
    const itemsByOrigin = {};
    allItems.forEach(item => {
      if (!itemsByOrigin[item.origin]) {
        itemsByOrigin[item.origin] = [];
      }
      itemsByOrigin[item.origin].push(item);
    });

    // Анализируем каждую группу предметов
    for (const [origin, items] of Object.entries(itemsByOrigin)) {
      console.log(`\n🎯 Анализ предметов для типа кейса: ${origin}`);
      console.log(`   Количество предметов: ${items.length}`);

      // Показываем статистику без бонуса (базовое распределение)
      const baseStats = getWeightDistributionStats(items, 0);
      console.log('\n   📈 Базовое распределение весов:');
      console.log(`   Общий вес: ${baseStats.originalTotalWeight}`);

      Object.entries(baseStats.categories).forEach(([category, data]) => {
        const avgPrice = isNaN(data.avgPrice) ? 0 : data.avgPrice;
        console.log(`   ${category}: ${data.count} предметов, ${data.originalPercentage}% веса, средняя цена: ₽${avgPrice.toFixed(2)}`);
      });

      // Показываем как изменится распределение с бонусом 5%
      const bonusStats = getWeightDistributionStats(items, 5);
      console.log('\n   🚀 Распределение с бонусом +5%:');
      console.log(`   Общий вес: ${bonusStats.modifiedTotalWeight} (изменение: ${bonusStats.weightChange}%)`);

      Object.entries(bonusStats.categories).forEach(([category, data]) => {
        const change = parseFloat(data.changePercentage);
        const changeIcon = change > 0 ? '📈' : change < 0 ? '📉' : '➡️';
        console.log(`   ${category}: ${data.modifiedPercentage}% веса ${changeIcon} (${change > 0 ? '+' : ''}${change}%)`);
      });

      // Показываем как изменится распределение с максимальным бонусом 15%
      const maxBonusStats = getWeightDistributionStats(items, 15);
      console.log('\n   🔥 Распределение с максимальным бонусом +15%:');
      console.log(`   Общий вес: ${maxBonusStats.modifiedTotalWeight} (изменение: ${maxBonusStats.weightChange}%)`);

      Object.entries(maxBonusStats.categories).forEach(([category, data]) => {
        const change = parseFloat(data.changePercentage);
        const changeIcon = change > 0 ? '📈' : change < 0 ? '📉' : '➡️';
        console.log(`   ${category}: ${data.modifiedPercentage}% веса ${changeIcon} (${change > 0 ? '+' : ''}${change}%)`);
      });
    }

    console.log('\n✅ Анализ весов дропа завершен!');
    console.log('\n💡 Калькулятор готов к использованию в реальном времени при открытии кейсов');
    console.log('📋 Для применения бонусов используйте функции:');
    console.log('   - calculateModifiedDropWeights(items, userBonusPercentage)');
    console.log('   - selectItemWithModifiedWeights(modifiedItems)');
    console.log('   - selectItemWithModifiedWeightsAndDuplicateProtection(items, userId, subscriptionTier)');

  } catch (error) {
    console.error('❌ Ошибка при пересчете весов дропа:', error);
  }
}

// Экспорт функций
module.exports = {
  populateDatabase,
  processItem,
  createCaseTemplates,
  validateProfitability,
  linkItemsToCaseTemplates,
  recalculateDropWeights,
  CASE_CONFIGS,
  ITEMS_URLS
};

// Функция для отображения сводки по подписочным кейсам
function printSubscriptionCaseSummary() {
  console.log('\n🎁 СВОДКА ПО ОБНОВЛЕННЫМ ПОДПИСОЧНЫМ КЕЙСАМ:\n');

  console.log('📊 ОЖИДАЕМАЯ СТОИМОСТЬ И РЕНТАБЕЛЬНОСТЬ:');
  console.log('┌─────────────────────────────┬─────────────────┬──────────────────┬─────────────────┐');
  console.log('│ Тип кейса                   │ Ожидаемая стоим.│ Целевая стоим.   │ Стоимость       │');
  console.log('├─────────────────────────────┼─────────────────┼──────────────────┼─────────────────┤');
  console.log('│ Статус (₽1210/30 дней)     │ ~₽35            │ ₽35              │ ₽40.33/день     │');
  console.log('│ Статус+ (₽2890/30 дней)    │ ~₽55            │ ₽55              │ ₽96.33/день     │');
  console.log('│ Статус++ (₽6819/30 дней)   │ ~₽85            │ ₽85              │ ₽227.30/день    │');
  console.log('└─────────────────────────────┴─────────────────┴──────────────────┴─────────────────┘');

  console.log('\n🎯 РАСПРЕДЕЛЕНИЕ ШАНСОВ:');
  console.log('┌─────────────────┬─────────┬─────────┬─────────┬─────────┬─────────┬─────────┐');
  console.log('│ Уровень         │Consumer │Industrial│Mil-Spec │Restricted│Classified│ Covert  │');
  console.log('├─────────────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┤');
  console.log('│ Уровень 1       │   50%   │   30%   │   15%   │    4%   │    1%   │   0%    │');
  console.log('│ Уровень 2       │   40%   │   30%   │   20%   │    8%   │    2%   │   0%    │');
  console.log('│ Уровень 3       │   30%   │   25%   │   25%   │   15%   │    4%   │   1%    │');
  console.log('└─────────────────┴─────────┴─────────┴─────────┴─────────┴─────────┴─────────┘');

  console.log('\n💰 БИЗНЕС-АНАЛИЗ (за 30 дней):');
  console.log('✅ Статус: ₽1050 награды vs ₽1210 стоимость → УБЫТОК -₽160 (-13.2%)');
  console.log('✅ Статус+: ₽1650 награды vs ₽2890 стоимость → ПРИБЫЛЬ +₽1240 (+42.9%)');
  console.log('✅ Статус++: ₽2550 награды vs ₽6819 стоимость → ПРИБЫЛЬ +₽4269 (+62.6%)');
  console.log('🎯 Подписчики платят за удобство + бонусы + лучшие шансы');
  console.log('💡 Основная прибыль от стимулирования покупок других кейсов');

  console.log('\n🎮 ИГРОВОЙ ОПЫТ:');
  console.log('• Статус: Ежедневные кейсы + 3% бонус + шанс на Classified до ₽10,000');
  console.log('• Статус+: Лучшие награды + 5% бонус + 2% шанс на Classified');
  console.log('• Статус++: Премиум награды + 10% бонус + Covert до ₽75,000 + защита дубликатов');

  console.log('\n📈 МОНЕТИЗАЦИОННАЯ СТРАТЕГИЯ:');
  console.log('• Подписки создают лояльность и retention игроков');
  console.log('• VIP игроки активнее покупают платные кейсы (основная прибыль)');
  console.log('• Высокие подписки окупаются через lifetime value');
}

// Запуск если вызван напрямую
if (require.main === module) {
  populateDatabase(3).then(() => {
    printSubscriptionCaseSummary();
  }).catch(console.error); // Ограничиваем до 3 предметов на категорию для тестирования
}
