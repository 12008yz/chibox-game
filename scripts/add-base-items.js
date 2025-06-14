const axios = require('axios');
const fs = require('fs');
const db = require('../models');

// Импортируем новые сервисы
const SteamPriceService = require('../services/steamPriceService');
const ProfitabilityCalculator = require('../utils/profitabilityCalculator');

// Импортируем полный список URLs
const COMPLETE_ITEMS_URLS = require('../utils/linkItems-complete');

// Инициализируем сервисы
const steamPriceService = new SteamPriceService(process.env.STEAM_API_KEY);
const profitabilityCalculator = new ProfitabilityCalculator(0.2); // 20% прибыль

// FALLBACK ЦЕНЫ (используются только при недоступности Steam API)
const FALLBACK_PRICES = {
  consumer: 8,       // ₽8 (базовые скины)
  industrial: 20,    // ₽20 (промышленные скины)
  milspec: 90,       // ₽90 (синие скины)
  restricted: 500,   // ₽500 (фиолетовые скины)
  classified: 1500,  // ₽1500 (розовые скины)
  covert: 10000,     // ₽10000 (красные скины)
  contraband: 30000, // ₽30000 (ножи)
  exotic: 100000     // ₽100000 (перчатки)
};

// БАЗОВЫЕ КОНФИГУРАЦИИ КЕЙСОВ (веса будут пересчитаны автоматически)
const BASE_CASE_CONFIGS = {
  subscription_tier1: {
    name: 'Подписочные кейсы (Уровень 1)',
    price: null, // Бесплатный
    target_expected_value: 40, // Целевая стоимость для бесплатного кейса
    min_subscription_tier: 1,
    type: 'daily'
  },
  subscription_tier2: {
    name: 'Подписочные кейсы (Уровень 2)',
    price: null, // Бесплатный
    target_expected_value: 80, // Повышенная стоимость для 2 уровня
    min_subscription_tier: 2,
    type: 'daily'
  },
  subscription_tier3: {
    name: 'Подписочные кейсы (Уровень 3)',
    price: null, // Бесплатный
    target_expected_value: 180, // Высокая стоимость для 3 уровня
    min_subscription_tier: 3,
    type: 'daily'
  },
  purchase: {
    name: 'Покупные кейсы ₽99',
    price: 99,
    target_expected_value: 79.20, // 80% от цены (20% прибыль)
    min_subscription_tier: 0,
    type: 'premium'
  },
  premium: {
    name: 'Премиум кейсы ₽499',
    price: 499,
    target_expected_value: 399.20, // 80% от цены (20% прибыль)
    min_subscription_tier: 0,
    type: 'special'
  }
};

// ВСЕ КЕЙСЫ СОДЕРЖАТ ВСЕ КАТЕГОРИИ ПРЕДМЕТОВ!
const ITEMS_URLS = {
  subscription_tier1: {
    consumer: COMPLETE_ITEMS_URLS.subscription.consumer.slice(0, 50),
    industrial: COMPLETE_ITEMS_URLS.subscription.industrial.slice(0, 30),
    milspec: COMPLETE_ITEMS_URLS.subscription.milspec.slice(0, 25),
    restricted: COMPLETE_ITEMS_URLS.subscription.restricted.slice(0, 15),
    classified: COMPLETE_ITEMS_URLS.subscription.classified.slice(0, 8),
    covert: COMPLETE_ITEMS_URLS.subscription.covert.slice(0, 5),
    contraband: COMPLETE_ITEMS_URLS.subscription.contraband.slice(0, 3),
    exotic: COMPLETE_ITEMS_URLS.subscription.exotic.slice(0, 2)
  },
  subscription_tier2: {
    consumer: COMPLETE_ITEMS_URLS.subscription.consumer.slice(0, 50),
    industrial: COMPLETE_ITEMS_URLS.subscription.industrial.slice(0, 30),
    milspec: COMPLETE_ITEMS_URLS.subscription.milspec.slice(0, 25),
    restricted: COMPLETE_ITEMS_URLS.subscription.restricted.slice(0, 15),
    classified: COMPLETE_ITEMS_URLS.subscription.classified.slice(0, 8),
    covert: COMPLETE_ITEMS_URLS.subscription.covert.slice(0, 5),
    contraband: COMPLETE_ITEMS_URLS.subscription.contraband.slice(0, 3),
    exotic: COMPLETE_ITEMS_URLS.subscription.exotic.slice(0, 2)
  },
  subscription_tier3: {
    consumer: COMPLETE_ITEMS_URLS.subscription.consumer.slice(0, 50),
    industrial: COMPLETE_ITEMS_URLS.subscription.industrial.slice(0, 30),
    milspec: COMPLETE_ITEMS_URLS.subscription.milspec.slice(0, 25),
    restricted: COMPLETE_ITEMS_URLS.subscription.restricted.slice(0, 15),
    classified: COMPLETE_ITEMS_URLS.subscription.classified.slice(0, 8),
    covert: COMPLETE_ITEMS_URLS.subscription.covert.slice(0, 5),
    contraband: COMPLETE_ITEMS_URLS.subscription.contraband.slice(0, 3),
    exotic: COMPLETE_ITEMS_URLS.subscription.exotic.slice(0, 2)
  },
  purchase: {
    consumer: COMPLETE_ITEMS_URLS.purchase.consumer.slice(0, 50),
    industrial: COMPLETE_ITEMS_URLS.purchase.industrial.slice(0, 30),
    milspec: COMPLETE_ITEMS_URLS.purchase.milspec.slice(0, 25),
    restricted: COMPLETE_ITEMS_URLS.purchase.restricted.slice(0, 15),
    classified: COMPLETE_ITEMS_URLS.purchase.classified.slice(0, 10),
    covert: COMPLETE_ITEMS_URLS.purchase.covert.slice(0, 6),
    contraband: COMPLETE_ITEMS_URLS.purchase.contraband.slice(0, 4),
    exotic: COMPLETE_ITEMS_URLS.purchase.exotic.slice(0, 3)
  },
  premium: {
    consumer: COMPLETE_ITEMS_URLS.premium.consumer.slice(0, 50),
    industrial: COMPLETE_ITEMS_URLS.premium.industrial.slice(0, 30),
    milspec: COMPLETE_ITEMS_URLS.premium.milspec.slice(0, 20),
    restricted: COMPLETE_ITEMS_URLS.premium.restricted.slice(0, 15),
    classified: COMPLETE_ITEMS_URLS.premium.classified.slice(0, 10),
    covert: COMPLETE_ITEMS_URLS.premium.covert.slice(0, 8),
    contraband: COMPLETE_ITEMS_URLS.premium.contraband.slice(0, 5),
    exotic: COMPLETE_ITEMS_URLS.premium.exotic.slice(0, 3)
  }
};

// Функция для определения редкости по цене (актуальные пороги 2025)
function determineRarityByPrice(priceRub) {
  if (priceRub >= 80000) return 'exotic';      // ₽80,000+ (дорогие перчатки)
  if (priceRub >= 25000) return 'contraband';  // ₽25,000+ (ножи)
  if (priceRub >= 8000) return 'covert';       // ₽8,000+ (красные скины)
  if (priceRub >= 1200) return 'classified';   // ₽1,200+ (розовые скины)
  if (priceRub >= 400) return 'restricted';    // ₽400+ (фиолетовые скины)
  if (priceRub >= 80) return 'milspec';        // ₽80+ (синие скины)
  if (priceRub >= 15) return 'industrial';     // ₽15+ (светло-синие)
  return 'consumer';                           // < ₽15 (белые)
}

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

// Функция для обработки одного предмета с актуальными ценами
async function processItem(url, originalRarity, caseType) {
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

    // Получаем актуальную цену и категорию через Steam API
    console.log(`💰 Получаем актуальную цену для: ${marketHashName}`);
    const priceData = await steamPriceService.getItemPrice(marketHashName);

    let priceRub, actualRarity, priceUsd;

    if (priceData.success && priceData.price_rub > 0) {
      // Используем актуальные данные из Steam
      priceRub = priceData.price_rub;
      priceUsd = priceData.price_usd;
      actualRarity = priceData.category;

      console.log(`✅ Steam API: ${marketHashName} - ₽${priceRub} - ${actualRarity}`);
    } else {
      // Fallback на статические цены
      priceRub = FALLBACK_PRICES[originalRarity] || 8;
      priceUsd = Math.round((priceRub / 95) * 100) / 100;
      actualRarity = originalRarity;

      console.log(`📝 Fallback цена: ${marketHashName} - ₽${priceRub} - ${actualRarity}`);
    }

    // Создаем ссылку на Steam Market
    const steamMarketUrl = `https://steamcommunity.com/market/listings/730/${encodeURIComponent(marketHashName)}`;

    // Генерируем изображение предмета
    const imageUrl = url;

    // Извлекаем детали предмета
    const weaponType = extractWeaponType(marketHashName);
    const skinName = extractSkinName(marketHashName);
    const exterior = extractExterior(marketHashName);

    // Создаем запись в базе данных (drop_weight будет установлен позже)
    const newItem = await db.Item.create({
      name: marketHashName,
      description: `CS2 ${actualRarity} skin ${marketHashName}`,
      image_url: imageUrl,
      price: priceRub,
      rarity: actualRarity,
      drop_weight: 1, // Временный вес, будет пересчитан
      min_subscription_tier: BASE_CASE_CONFIGS[caseType]?.min_subscription_tier || 0,
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
      origin: `${caseType}_case`,
      // Новые поля для актуальных цен
      actual_price_rub: priceRub,
      price_last_updated: new Date(),
      price_source: priceData.success ? 'steam_api' : 'fallback'
    });

    console.log(`✅ Добавлен: ${marketHashName} - ₽${priceRub} - ${actualRarity}`);
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
  console.log('📦 Создаем шаблоны кейсов с актуальным ценообразованием...\n');

  const templates = [
    {
      name: 'Ежедневный кейс (Уровень 1)',
      description: 'Бесплатный ежедневный кейс для подписчиков 1 уровня с актуальными ценами Steam Market',
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
      description: 'Улучшенный ежедневный кейс для подписчиков 2 уровня с повышенными шансами',
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
      description: 'Премиум ежедневный кейс для подписчиков 3 уровня с гарантированной высокой стоимостью',
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
      description: 'Кейс за ₽99 с точно настроенной 20% рентабельностью и актуальными ценами',
      type: 'premium',
      min_subscription_tier: 0,
      is_active: true,
      price: 99, // 99 рублей
      color_scheme: '#FF9800',
      sort_order: 4
    },
    {
      name: 'Премиум кейс',
      description: 'Эксклюзивный кейс за ₽499 с ножами и перчатками, 20% рентабельность гарантирована',
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

// Основная функция для наполнения базы данных с актуальными ценами
async function populateDatabase(limitPerCategory = 1000) {
  console.log('🚀 Начинаем наполнение базы данных предметами CS2 с актуальными ценами...\n');

  let totalItems = 0;
  let successfulItems = 0;
  const itemsByCategory = {};

  // Создаем шаблоны кейсов
  await createCaseTemplates();

  // Обрабатываем предметы для каждого типа кейса
  for (const [caseType, categories] of Object.entries(ITEMS_URLS)) {
    console.log(`\n📦 Обрабатываем кейс: ${BASE_CASE_CONFIGS[caseType]?.name || caseType}`);

    itemsByCategory[caseType] = {};

    for (const [rarity, urls] of Object.entries(categories)) {
      console.log(`\n🎯 Редкость: ${rarity} (${urls.length} предметов)`);

      itemsByCategory[caseType][rarity] = [];

      // Ограничиваем количество для тестирования
      const urlsToProcess = urls.slice(0, limitPerCategory);

      for (let i = 0; i < urlsToProcess.length; i++) {
        const url = urlsToProcess[i];
        console.log(`[${i + 1}/${urlsToProcess.length}] Обрабатываем: ${rarity}`);

        const result = await processItem(url, rarity, caseType);
        totalItems++;

        if (result) {
          successfulItems++;
          itemsByCategory[caseType][rarity].push(result);
        }
      }
    }
  }

  console.log('\n🎉 Наполнение базы данных завершено!');
  console.log(`📊 Статистика:`);
  console.log(`- Всего обработано: ${totalItems}`);
  console.log(`- Успешно добавлено: ${successfulItems}`);
  console.log(`- Ошибок: ${totalItems - successfulItems}`);

  // Рассчитываем оптимальные веса для каждого кейса
  await calculateOptimalWeights(itemsByCategory);

  // Связываем предметы с шаблонами кейсов
  await linkItemsToCaseTemplates();

  // Финальная проверка рентабельности
  await validateProfitability(itemsByCategory);

  // Очищаем кэш цен
  steamPriceService.cleanExpiredCache();

  console.log('\n✅ Система кейсов настроена с 20% рентабельностью!');
}

// Функция для расчета оптимальных весов на основе актуальных цен
async function calculateOptimalWeights(itemsByCategory) {
  console.log('\n⚖️ РАСЧЕТ ОПТИМАЛЬНЫХ ВЕСОВ НА ОСНОВЕ АКТУАЛЬНЫХ ЦЕН:\n');

  for (const [caseType, categorizedItems] of Object.entries(itemsByCategory)) {
    const caseConfig = BASE_CASE_CONFIGS[caseType];
    if (!caseConfig) continue;

    console.log(`📦 Кейс: ${caseConfig.name}`);

    // Группируем предметы по актуальным категориям (не по исходным)
    const actualCategories = {};
    for (const [originalCategory, items] of Object.entries(categorizedItems)) {
      for (const item of items) {
        const actualCategory = item.rarity;
        if (!actualCategories[actualCategory]) {
          actualCategories[actualCategory] = [];
        }
        actualCategories[actualCategory].push(item);
      }
    }

    if (caseConfig.price) {
      // Для платных кейсов рассчитываем точные веса для 20% прибыли
      const optimization = profitabilityCalculator.calculateOptimalWeights(
        actualCategories,
        caseConfig.price
      );

      if (optimization.isOptimal) {
        console.log(`✅ Веса оптимизированы для ${caseConfig.name}`);

        // Обновляем веса предметов в базе данных
        await updateItemWeights(actualCategories, optimization.weights);
      } else {
        console.log(`⚠️ Требуется дополнительная настройка для ${caseConfig.name}`);
      }
    } else {
      // Для бесплатных кейсов используем базовые веса
      const baseWeights = {
        consumer: 600,    // 60%
        industrial: 250,  // 25%
        milspec: 100,     // 10%
        restricted: 35,   // 3.5%
        classified: 12,   // 1.2%
        covert: 2.5,      // 0.25%
        contraband: 0.4,  // 0.04%
        exotic: 0.1       // 0.01%
      };

      console.log(`📝 Используем базовые веса для бесплатного кейса: ${caseConfig.name}`);
      await updateItemWeights(actualCategories, baseWeights);
    }
  }
}

// Функция для обновления весов предметов в базе данных
async function updateItemWeights(itemsByCategory, weights) {
  for (const [category, items] of Object.entries(itemsByCategory)) {
    const baseWeight = weights[category] || 1;

    for (const item of items) {
      // Добавляем небольшую вариацию в веса (±10%)
      const variation = (Math.random() - 0.5) * 0.2; // ±10%
      const finalWeight = Math.max(0.01, baseWeight * (1 + variation));

      await db.Item.update(
        { drop_weight: Math.round(finalWeight * 100) / 100 },
        { where: { id: item.id } }
      );
    }
  }
}

// Функция для проверки рентабельности с актуальными ценами
async function validateProfitability(itemsByCategory) {
  console.log('\n💰 ФИНАЛЬНАЯ ПРОВЕРКА РЕНТАБЕЛЬНОСТИ:\n');

  for (const [caseType, categorizedItems] of Object.entries(itemsByCategory)) {
    const caseConfig = BASE_CASE_CONFIGS[caseType];
    if (!caseConfig) continue;

    // Группируем предметы по актуальным категориям
    const actualCategories = {};
    for (const [originalCategory, items] of Object.entries(categorizedItems)) {
      for (const item of items) {
        const actualCategory = item.rarity;
        if (!actualCategories[actualCategory]) {
          actualCategories[actualCategory] = [];
        }
        actualCategories[actualCategory].push(item);
      }
    }

    if (caseConfig.price) {
      // Валидируем платные кейсы
      const validation = profitabilityCalculator.validateCaseProfitability(
        {
          name: caseConfig.name,
          price: caseConfig.price,
          drop_weights: await getCurrentWeights(actualCategories)
        },
        actualCategories
      );

      console.log(`📦 ${validation.caseName}:`);
      console.log(`   Цена кейса: ₽${validation.casePrice}`);
      console.log(`   Ожидаемая стоимость: ₽${validation.expectedValue.toFixed(2)}`);
      console.log(`   Прибыль: ₽${validation.profit.toFixed(2)}`);
      console.log(`   Рентабельность: ${(validation.profitMargin * 100).toFixed(1)}% (цель: 20%)`);
      console.log(`   Статус: ${validation.status}`);
      console.log(`   Рекомендация: ${validation.recommendation}`);
    } else {
      // Для бесплатных кейсов показываем ожидаемую стоимость
      const avgPrices = profitabilityCalculator.calculateAveragePrices(actualCategories);
      const weights = await getCurrentWeights(actualCategories);
      const expectedValue = profitabilityCalculator.calculateExpectedValue(weights, avgPrices);

      console.log(`📦 ${caseConfig.name} (бесплатный):`);
      console.log(`   Ожидаемая стоимость: ₽${expectedValue.toFixed(2)}`);
      console.log(`   Целевая стоимость: ₽${caseConfig.target_expected_value}`);
      console.log(`   Статус: ${expectedValue <= caseConfig.target_expected_value * 1.1 ? '✅ В НОРМЕ' : '⚠️ ПРЕВЫШАЕТ'}`);
    }
    console.log('');
  }
}

// Вспомогательная функция для получения текущих весов
async function getCurrentWeights(itemsByCategory) {
  const weights = {};

  for (const [category, items] of Object.entries(itemsByCategory)) {
    if (items.length > 0) {
      // Берем средний вес по категории
      const avgWeight = items.reduce((sum, item) => sum + (item.drop_weight || 1), 0) / items.length;
      weights[category] = avgWeight;
    }
  }

  return weights;
}

// Функция для связывания предметов с шаблонами кейсов
async function linkItemsToCaseTemplates() {
  console.log('\n🔗 Связываем предметы с шаблонами кейсов...\n');

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

      let originPattern = CASE_ITEM_MAPPING[template.name];

      if (!originPattern) {
        if (template.name.includes('Ежедневный') || template.type === 'daily') {
          if (template.name.includes('Уровень 1')) {
            originPattern = 'subscription_tier1_case';
          } else if (template.name.includes('Уровень 2')) {
            originPattern = 'subscription_tier2_case';
          } else if (template.name.includes('Уровень 3')) {
            originPattern = 'subscription_tier3_case';
          } else {
            originPattern = 'subscription_tier1_case';
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

// Экспорт функций
module.exports = {
  populateDatabase,
  processItem,
  createCaseTemplates,
  calculateOptimalWeights,
  validateProfitability,
  linkItemsToCaseTemplates,
  updateItemWeights,
  BASE_CASE_CONFIGS,
  ITEMS_URLS,
  FALLBACK_PRICES,
  steamPriceService,
  profitabilityCalculator
};

// Запуск если вызван напрямую
if (require.main === module) {
  console.log('🚀 Запуск системы кейсов с актуальными ценами Steam Market...');
  console.log(`📊 Steam API ключ: ${process.env.STEAM_API_KEY ? 'Настроен' : 'НЕ НАСТРОЕН'}`);
  console.log('⚙️ Целевая рентабельность: 20% (80% возврат пользователям)\n');

  populateDatabase(20) // Ограничиваем до 20 предметов на категорию для тестирования
    .then(() => {
      console.log('\n🎉 Система кейсов успешно настроена!');
      console.log('💡 Для полного наполнения увеличьте лимит в populateDatabase()');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Ошибка настройки системы кейсов:', error);
      process.exit(1);
    });
}
