// Анализ рентабельности кейсов и оптимизация для 20% прибыли
const COMPLETE_ITEMS_URLS = require('../utils/linkItems-complete');
const { CASE_CONFIGS, REALISTIC_ITEM_PRICES } = require('./add-base-items');

// Цены подписок (реальные данные)
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

// РЕАЛЬНЫЕ средние цены предметов по редкости (в рублях)
// Основано на анализе Steam Market и linkItems-complete.js
const ESTIMATED_ITEM_PRICES = {
  consumer: 50,      // ₽20-100 (Battle-Scarred скины, P250 Sand Dune и т.д.)
  industrial: 200,   // ₽100-500 (Industrial Grade)
  milspec: 800,      // ₽400-1500 (Mil-Spec Grade)
  restricted: 3000,  // ₽1500-6000 (Restricted - AK Phantom Disruptor и т.д.)
  classified: 8000,  // ₽4000-15000 (Classified - AK Redline, M4 Asiimov и т.д.)
  covert: 50000,     // ₽30000-80000 (Covert - AK Fire Serpent, Dragon Lore и т.д.)
  contraband: 250000, // ₽200000-300000 (Ножи - Karambit Doppler и т.д.)
  exotic: 500000     // ₽400000+ (Перчатки - самые дорогие предметы)
};

// Используем актуальные веса из add-base-items.js
const CURRENT_WEIGHTS = {};
Object.keys(CASE_CONFIGS).forEach(caseType => {
  CURRENT_WEIGHTS[caseType] = CASE_CONFIGS[caseType].drop_weights;
});

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

// Основная функция проверки
function checkCurrentWeights() {
  console.log('🚀 ПРОВЕРКА ТЕКУЩИХ ВЕСОВ ИЗ ADD-BASE-ITEMS.JS\n');
  console.log('=' .repeat(60) + '\n');

  // Целевые ожидаемые стоимости (80% от дохода)
  const targets = {
    subscription_tier1: SUBSCRIPTION_PRICES[1].daily_cost * 0.8, // ₽32.26
    subscription_tier2: SUBSCRIPTION_PRICES[2].daily_cost * 0.8, // ₽77.06
    subscription_tier3: SUBSCRIPTION_PRICES[3].daily_cost * 0.8, // ₽181.84
    purchase: PAID_CASES.purchase.price * 0.8, // ₽79.20
    premium: PAID_CASES.premium.price * 0.8     // ₽399.20
  };

  console.log('📋 ЦЕЛЕВЫЕ СТОИМОСТИ (80% от дохода):');
  Object.entries(targets).forEach(([caseType, target]) => {
    console.log(`   ${caseType}: ₽${target.toFixed(2)}`);
  });
  console.log('');

  console.log('✅ ПРОВЕРКА ТЕКУЩИХ ВЕСОВ:\n');

  Object.entries(CURRENT_WEIGHTS).forEach(([caseType, weights]) => {
    const expectedValue = calculateExpectedValue(weights);
    const target = targets[caseType];
    const difference = expectedValue - target;
    const accuracy = Math.abs(difference / target * 100);
    const profitability = ((target - expectedValue) / target * 100) + 20; // Фактическая рентабельность

    console.log(`📦 ${caseType.toUpperCase()}:`);
    console.log(`   Ожидаемая стоимость: ₽${expectedValue.toFixed(2)}`);
    console.log(`   Целевая стоимость: ₽${target.toFixed(2)}`);
    console.log(`   Разница: ${difference >= 0 ? '+' : ''}₽${difference.toFixed(2)}`);
    console.log(`   Фактическая рентабельность: ${profitability.toFixed(1)}%`);
    console.log(`   Статус: ${accuracy <= 5 ? '✅ ОТЛИЧНО' : accuracy <= 15 ? '⚠️ ПРИЕМЛЕМО' : '❌ ТРЕБУЕТ КОРРЕКТИРОВКИ'}`);
    console.log('');
  });

  console.log('=' .repeat(60));
  console.log('✅ АНАЛИЗ ЗАВЕРШЕН');
}

// Экспорт
module.exports = {
  SUBSCRIPTION_PRICES,
  PAID_CASES,
  ESTIMATED_ITEM_PRICES,
  CURRENT_WEIGHTS,
  calculateExpectedValue,
  checkCurrentWeights
};

// Запуск если вызван напрямую
if (require.main === module) {
  checkCurrentWeights();
}
