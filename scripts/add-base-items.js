const axios = require('axios');
const fs = require('fs');
const db = require('../models');

// Импортируем функции для получения данных с Steam
const { getSteamItemData, getSteamItemsBatch, testSteamAPI } = require('./steam-item-fetcher');

// Импортируем полный список URLs
const COMPLETE_ITEMS_URLS = require('../utils/linkItems-complete');

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
  subscription: {
    name: 'Подписочные кейсы',
    target_expected_value: 0.20,
    min_subscription_tier: 1,
    drop_weights: {
      consumer: 600,    // 60%
      industrial: 320,  // 32%
      milspec: 70,      // 7%
      restricted: 10    // 1%
    }
  },
  purchase: {
    name: 'Покупные кейсы $0.99',
    target_expected_value: 0.79,
    price: 0.99,
    min_subscription_tier: 0,
    drop_weights: {
      consumer: 600,     // 60%
      industrial: 250,   // 25%
      milspec: 100,      // 10%
      restricted: 40,    // 4%
      classified: 8,     // 0.8%
      covert: 1.5,       // 0.15%
      knives_budget: 0.5 // 0.05%
    }
  },
  premium: {
    name: 'Премиум кейсы $4.99',
    target_expected_value: 3.99,
    price: 4.99,
    min_subscription_tier: 0,
    drop_weights: {
      milspec: 400,     // 40%
      restricted: 350,  // 35%
      classified: 150,  // 15%
      covert: 70,       // 7%
      knives: 25,       // 2.5%
      gloves: 5         // 0.5%
    }
  }
};

// Списки URL для каждого типа кейса
const ITEMS_URLS = {
  subscription: {
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
      // Добавьте остальные 120 Consumer Grade URL...
    ],
    industrial: [
      'https://steamcommunity.com/market/listings/730/AK-47%20%7C%20Blue%20Laminate%20%28Well-Worn%29',
      'https://steamcommunity.com/market/listings/730/M4A4%20%7C%20Faded%20Zebra%20%28Field-Tested%29',
      'https://steamcommunity.com/market/listings/730/M4A1-S%20%7C%20Bright%20Water%20%28Field-Tested%29',
      'https://steamcommunity.com/market/listings/730/Glock-18%20%7C%20Blue%20Fissure%20%28Factory%20New%29',
      'https://steamcommunity.com/market/listings/730/USP-S%20%7C%20Stainless%20%28Factory%20New%29',
      // Добавьте остальные 95 Industrial Grade URL...
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
      'https://steamcommunity.com/market/listings/730/FAMAS%20%7C%20Roll%20Cage%20%28Field-Tested%29',
      // Добавьте остальные 20 Restricted URL...
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
    knives_budget: [
      'https://steamcommunity.com/market/listings/730/%E2%98%85%20Gut%20Knife%20%7C%20Safari%20Mesh%20%28Battle-Scarred%29',
      'https://steamcommunity.com/market/listings/730/%E2%98%85%20Navaja%20Knife%20%7C%20Urban%20Masked%20%28Well-Worn%29',
      'https://steamcommunity.com/market/listings/730/%E2%98%85%20Falchion%20Knife%20%7C%20Forest%20DDPAT%20%28Field-Tested%29',
      'https://steamcommunity.com/market/listings/730/%E2%98%85%20Shadow%20Daggers%20%7C%20Safari%20Mesh%20%28Battle-Scarred%29',
      'https://steamcommunity.com/market/listings/730/%E2%98%85%20Paracord%20Knife%20%7C%20Safari%20Mesh%20%28Field-Tested%29'
    ]
  },

  premium: {
    knives: [
      'https://steamcommunity.com/market/listings/730/%E2%98%85%20Flip%20Knife%20%7C%20Damascus%20Steel%20%28Field-Tested%29',
      'https://steamcommunity.com/market/listings/730/%E2%98%85%20Huntsman%20Knife%20%7C%20Case%20Hardened%20%28Factory%20New%29',
      'https://steamcommunity.com/market/listings/730/%E2%98%85%20Karambit%20%7C%20Doppler%20%28Factory%20New%29',
      'https://steamcommunity.com/market/listings/730/%E2%98%85%20Butterfly%20Knife%20%7C%20Tiger%20Tooth%20%28Factory%20New%29',
      'https://steamcommunity.com/market/listings/730/%E2%98%85%20M9%20Bayonet%20%7C%20Fade%20%28Factory%20New%29',
      // Добавьте остальные 10 Premium Knives URL...
    ],
    gloves: [
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

    // Получаем данные с Steam
    const steamData = await getSteamItemData(marketHashName);

    if (steamData.error) {
      console.error(`❌ Ошибка получения данных: ${marketHashName} - ${steamData.error}`);
      return null;
    }

    // Извлекаем основную информацию
    const price = steamData.price_usd || 0.10;
    const autoRarity = determineRarityByPrice(price * 100); // Конвертируем в центы
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
      price: price,
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

    console.log(`✅ Добавлен: ${marketHashName} - $${price} - ${finalRarity} - weight: ${Math.round(dropWeight * 100) / 100}`);
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

        const result = await processItem(url, rarity, caseType, 2000);
        totalItems++;

        if (result) {
          successfulItems++;
        }

        // Дополнительная задержка между запросами
        if (i < urlsToProcess.length - 1) {
          console.log('⏳ Ждем 2 секунды...');
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
        const avgPrice = rarityItems.reduce((sum, item) => sum + parseFloat(item.price), 0) / rarityItems.length;
        const contribution = (weight / 1000) * avgPrice;
        expectedValue += contribution;
        totalWeight += weight;

        console.log(`   ${rarity}: ${rarityItems.length} предметов, вес: ${weight}, средняя цена: $${avgPrice.toFixed(3)}, вклад: $${contribution.toFixed(3)}`);
      }
    });

    console.log(`   Ожидаемая стоимость: $${expectedValue.toFixed(3)}`);
    console.log(`   Целевая стоимость: $${config.target_expected_value}`);

    if (config.price) {
      const profit = config.price - expectedValue;
      const profitability = (profit / config.price * 100);
      console.log(`   Цена кейса: $${config.price}`);
      console.log(`   Прибыль: $${profit.toFixed(3)}`);
      console.log(`   Рентабельность: ${profitability.toFixed(1)}%`);
      console.log(`   Статус: ${profitability >= 18 && profitability <= 25 ? '✅ ОПТИМАЛЬНО' : profitability >= 15 ? '⚠️  ПРИЕМЛЕМО' : '❌ УБЫТОЧНО'}`);
    } else {
      console.log(`   Статус: ${expectedValue <= config.target_expected_value ? '✅ СООТВЕТСТВУЕТ' : '❌ ПРЕВЫШАЕТ ЛИМИТ'}`);
    }
    console.log('');
  }
}

// Экспорт функций
module.exports = {
  populateDatabase,
  processItem,
  createCaseTemplates,
  validateProfitability,
  CASE_CONFIGS,
  ITEMS_URLS
};

// Запуск если вызван напрямую
if (require.main === module) {
  populateDatabase(3).catch(console.error); // Ограничиваем до 3 предметов на категорию для тестирования
}
