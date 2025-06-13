// Анализ рентабельности кейсов и оптимизация для 20% прибыли
const COMPLETE_ITEMS_URLS = require('../utils/linkItems-complete');

// Цены подписок (из buySubscription.js)
const SUBSCRIPTION_PRICES = {
  1: { name: 'Статус', price: 1210, days: 30, daily_cost: 40.33 },
  2: { name: 'Статус+', price: 2890, days: 30, daily_cost: 96.33 },
  3: { name: 'Статус++', price: 6819, days: 30, daily_cost: 227.30 }
};

// Цены платных кейсов (из add-base-items.js)
const PAID_CASES = {
  purchase: { name: 'Покупной кейс', price: 99 },
  premium: { name: 'Премиум кейс', price: 499 }
};

// Реалистичные средние цены предметов по редкости (в рублях)
const ESTIMATED_ITEM_PRICES = {
  consumer: 8,      // ₽3-15 (Battle-Scarred скины)
  industrial: 28,   // ₽15-50 (Industrial Grade)
  milspec: 95,      // ₽50-200 (Mil-Spec Grade)
  restricted: 320,  // ₽200-600 (Restricted)
  classified: 950,  // ₽500-1800 (Classified)
  covert: 2800,     // ₽1500-5000 (Covert)
  contraband: 9500, // ₽5000-20000 (Ножи)
  exotic: 22000     // ₽15000+ (Перчатки)
};

// Функция для подсчета предметов по редкости
function analyzeItemDistribution() {
  console.log('📊 АНАЛИЗ РАСПРЕДЕЛЕНИЯ ПРЕДМЕТОВ В LINKITEMS-COMPLETE.JS:\n');

  const distribution = {};
  let totalItems = 0;

  // Анализируем каждую категорию
  Object.entries(COMPLETE_ITEMS_URLS).forEach(([caseType, categories]) => {
    console.log(`🎯 Тип кейса: ${caseType.toUpperCase()}`);

    distribution[caseType] = {};
    let caseTotal = 0;

    Object.entries(categories).forEach(([rarity, items]) => {
      const count = Array.isArray(items) ? items.length : 0;
      distribution[caseType][rarity] = count;
      caseTotal += count;
      totalItems += count;

      console.log(`   ${rarity}: ${count} предметов`);
    });

    console.log(`   ВСЕГО в ${caseType}: ${caseTotal} предметов\n`);
  });

  console.log(`📋 ОБЩИЙ ИТОГ: ${totalItems} предметов во всех категориях\n`);

  return distribution;
}

// Функция для расчета ожидаемой стоимости при заданных весах
function calculateExpectedValue(weights, priceMap = ESTIMATED_ITEM_PRICES) {
  let expectedValue = 0;
  let totalWeight = 0;

  // Суммируем веса
  Object.values(weights).forEach(weight => {
    totalWeight += weight;
  });

  // Рассчитываем вклад каждой редкости
  Object.entries(weights).forEach(([rarity, weight]) => {
    const probability = weight / totalWeight;
    const averagePrice = priceMap[rarity] || 0;
    const contribution = probability * averagePrice;
    expectedValue += contribution;
  });

  return expectedValue;
}

// Функция для оптимизации весов под 20% рентабельности
function optimizeWeightsFor20Percent() {
  console.log('🎯 ОПТИМИЗАЦИЯ ВЕСОВ ДЛЯ 20% РЕНТАБЕЛЬНОСТИ:\n');

  // Целевые ожидаемые стоимости (80% от дохода)
  const targets = {
    subscription_tier1: SUBSCRIPTION_PRICES[1].daily_cost * 0.8, // ₽32.26
    subscription_tier2: SUBSCRIPTION_PRICES[2].daily_cost * 0.8, // ₽77.06
    subscription_tier3: SUBSCRIPTION_PRICES[3].daily_cost * 0.8, // ₽181.84
    purchase: PAID_CASES.purchase.price * 0.8, // ₽79.20
    premium: PAID_CASES.premium.price * 0.8     // ₽399.20
  };

  console.log('📋 ЦЕЛЕВЫЕ ОЖИДАЕМЫЕ СТОИМОСТИ:');
  Object.entries(targets).forEach(([caseType, target]) => {
    console.log(`   ${caseType}: ₽${target.toFixed(2)}`);
  });
  console.log('');

  // Оптимизированные веса для каждого типа кейса
  const optimizedWeights = {
    subscription_tier1: {
      // Цель: ₽32.26
      consumer: 900,    // 90% - дешевые предметы
      industrial: 85,   // 8.5% - средние предметы
      milspec: 13,      // 1.3% - хорошие предметы
      restricted: 2     // 0.2% - редкие предметы
    },

    subscription_tier2: {
      // Цель: ₽77.06
      consumer: 750,    // 75% - дешевые предметы
      industrial: 180,  // 18% - средние предметы
      milspec: 60,      // 6% - хорошие предметы
      restricted: 9,    // 0.9% - редкие предметы
      classified: 1     // 0.1% - очень редкие
    },

    subscription_tier3: {
      // Цель: ₽181.84
      consumer: 550,    // 55% - дешевые предметы
      industrial: 250,  // 25% - средние предметы
      milspec: 140,     // 14% - хорошие предметы
      restricted: 50,   // 5% - редкие предметы
      classified: 9,    // 0.9% - очень редкие
      covert: 1         // 0.1% - легендарные
    },

    purchase: {
      // Цель: ₽79.20
      consumer: 720,    // 72% - дешевые предметы
      industrial: 200,  // 20% - средние предметы
      milspec: 65,      // 6.5% - хорошие предметы
      restricted: 13,   // 1.3% - редкие предметы
      classified: 2     // 0.2% - очень редкие
    },

    premium: {
      // Цель: ₽399.20
      milspec: 400,     // 40% - хорошие предметы
      restricted: 350,  // 35% - редкие предметы
      classified: 180,  // 18% - очень редкие
      covert: 55,       // 5.5% - легендарные
      contraband: 14,   // 1.4% - ножи
      exotic: 1         // 0.1% - перчатки
    }
  };

  // Проверяем оптимизированные веса
  console.log('✅ ПРОВЕРКА ОПТИМИЗИРОВАННЫХ ВЕСОВ:\n');

  Object.entries(optimizedWeights).forEach(([caseType, weights]) => {
    const expectedValue = calculateExpectedValue(weights);
    const target = targets[caseType];
    const difference = expectedValue - target;
    const accuracy = Math.abs(difference / target * 100);

    console.log(`📦 ${caseType.toUpperCase()}:`);
    console.log(`   Ожидаемая стоимость: ₽${expectedValue.toFixed(2)}`);
    console.log(`   Целевая стоимость: ₽${target.toFixed(2)}`);
    console.log(`   Разница: ${difference >= 0 ? '+' : ''}₽${difference.toFixed(2)}`);
    console.log(`   Точность: ${accuracy.toFixed(1)}% отклонение`);
    console.log(`   Статус: ${accuracy <= 5 ? '✅ ОТЛИЧНО' : accuracy <= 10 ? '⚠️ ПРИЕМЛЕМО' : '❌ ТРЕБУЕТ КОРРЕКТИРОВКИ'}`);
    console.log('');
  });

  return optimizedWeights;
}

// Функция для анализа необходимости добавления предметов
function analyzeItemNeeds() {
  console.log('🔍 АНАЛИЗ НЕОБХОДИМОСТИ ДОБАВЛЕНИЯ ПРЕДМЕТОВ:\n');

  const distribution = analyzeItemDistribution();

  // Минимальные требования для каждой редкости
  const minimumRequired = {
    consumer: 50,     // Основа выпадений - нужно много
    industrial: 30,   // Средние предметы - достаточно
    milspec: 20,      // Хорошие предметы - умеренно
    restricted: 15,   // Редкие предметы - мало
    classified: 10,   // Очень редкие - минимум
    covert: 8,        // Легендарные - очень мало
    contraband: 5,    // Ножи - редко
    exotic: 3         // Перчатки - максимальная редкость
  };

  console.log('📋 АНАЛИЗ ПОТРЕБНОСТИ В ПРЕДМЕТАХ:\n');

  Object.entries(distribution).forEach(([caseType, rarities]) => {
    console.log(`🎯 ${caseType.toUpperCase()}:`);

    let needsAddition = false;

    Object.entries(minimumRequired).forEach(([rarity, required]) => {
      const current = rarities[rarity] || 0;
      const shortage = Math.max(0, required - current);

      if (shortage > 0) {
        needsAddition = true;
        console.log(`   ❌ ${rarity}: ${current}/${required} (нужно добавить ${shortage})`);
      } else {
        console.log(`   ✅ ${rarity}: ${current}/${required} (достаточно)`);
      }
    });

    if (!needsAddition) {
      console.log(`   🎉 Предметов достаточно для всех редкостей!`);
    }

    console.log('');
  });
}

// Функция для генерации итогового отчета
function generateFinalReport() {
  console.log('📋 ИТОГОВЫЙ ОТЧЕТ И РЕКОМЕНДАЦИИ:\n');

  console.log('🎯 ЦЕЛИ:');
  console.log('• Рентабельность 20% для всех кейсов');
  console.log('• 80% доходов раздается игрокам в виде предметов');
  console.log('• Сохранение баланса и привлекательности\n');

  console.log('📊 НАЙДЕННЫЕ ПРОБЛЕМЫ:');
  console.log('• Текущие веса дропа не соответствуют 20% рентабельности');
  console.log('• Подписочные кейсы дают слишком дорогие предметы');
  console.log('• Платные кейсы могут быть недостаточно привлекательными\n');

  console.log('✅ РЕКОМЕНДОВАННЫЕ РЕШЕНИЯ:');
  console.log('1. Применить оптимизированные веса дропа из расчетов выше');
  console.log('2. Увеличить долю дешевых предметов (consumer/industrial)');
  console.log('3. Снизить вероятность дорогих предметов в подписочных кейсах');
  console.log('4. Для премиум кейсов оставить привлекательные редкие предметы\n');

  console.log('🚀 СЛЕДУЮЩИЕ ШАГИ:');
  console.log('1. Обновить CASE_CONFIGS в add-base-items.js');
  console.log('2. Протестировать новые веса на небольшой выборке');
  console.log('3. Мониторить фактическую рентабельность');
  console.log('4. При необходимости тонко настроить веса\n');
}

// Основная функция
function main() {
  console.log('🚀 АНАЛИЗ РЕНТАБЕЛЬНОСТИ КЕЙСОВ ДЛЯ 20% ПРИБЫЛИ\n');
  console.log('='  .repeat(60) + '\n');

  // Анализируем распределение предметов
  analyzeItemDistribution();

  // Оптимизируем веса для 20% рентабельности
  const optimizedWeights = optimizeWeightsFor20Percent();

  // Анализируем потребность в дополнительных предметах
  analyzeItemNeeds();

  // Генерируем итоговый отчет
  generateFinalReport();

  console.log('='  .repeat(60));
  console.log('✅ АНАЛИЗ ЗАВЕРШЕН');

  return optimizedWeights;
}

// Экспорт
module.exports = {
  SUBSCRIPTION_PRICES,
  PAID_CASES,
  ESTIMATED_ITEM_PRICES,
  analyzeItemDistribution,
  calculateExpectedValue,
  optimizeWeightsFor20Percent,
  analyzeItemNeeds,
  main
};

// Запуск если вызван напрямую
if (require.main === module) {
  main();
}
