/**
 * Скрипт для анализа экономики игры и генерации плана оптимизации
 * Цель: достижение рентабельности 20-25%
 */

const ProfitabilityCalculator = require('../utils/profitabilityCalculator');
const fs = require('fs');
const path = require('path');

class EconomyAnalyzer {
  constructor() {
    this.calculator = new ProfitabilityCalculator(0.225); // 22.5% целевая рентабельность
  }

  /**
   * Основной анализ экономики
   */
  analyzeEconomy() {
    console.log('🔍 АНАЛИЗ ЭКОНОМИКИ ИГРЫ');
    console.log('=' * 50);

    // Получаем полный анализ
    const analysis = this.calculator.analyzeCurrentEconomy();

    // Выводим результаты
    this.printSubscriptionAnalysis(analysis.subscriptions);
    this.printCaseAnalysis(analysis.cases);
    this.printFreeActivitiesAnalysis(analysis.freeActivities);
    this.printTradingAnalysis(analysis.trading);
    this.printOverallAnalysis(analysis.overall);

    return analysis;
  }

  /**
   * Генерация плана оптимизации
   */
  generateOptimizationPlan() {
    console.log('\n📋 ПЛАН ОПТИМИЗАЦИИ ДЛЯ 20-25% РЕНТАБЕЛЬНОСТИ');
    console.log('=' * 50);

    const plan = this.calculator.generateOptimizationPlan();

    this.printOptimizationPlan(plan);

    return plan;
  }

  /**
   * Анализ подписок
   */
  printSubscriptionAnalysis(subscriptions) {
    console.log('\n💰 АНАЛИЗ ПОДПИСОК');
    console.log('-' * 30);

    for (const [tier, data] of Object.entries(subscriptions)) {
      console.log(`\n${tier.toUpperCase()}:`);
      console.log(`  Цена: ${data.monthlyPrice}₽/месяц`);
      console.log(`  Затраты: ${data.monthlyCosts.toFixed(2)}₽/месяц`);
      console.log(`    - Ежедневные кейсы: ${data.dailyCaseCost.toFixed(2)}₽/день × 30 = ${(data.dailyCaseCost * 30).toFixed(2)}₽`);
      console.log(`    - Бонус от дропов: ${data.bonusValue.toFixed(2)}₽`);
      console.log(`    - Бесплатные активности: ${data.freeActivitiesCost.toFixed(2)}₽`);
      console.log(`  Прибыль: ${data.profit.toFixed(2)}₽`);
      console.log(`  Рентабельность: ${(data.profitMargin * 100).toFixed(1)}%`);
      console.log(`  Статус: ${data.isOptimal ? '✅ ОПТИМАЛЬНО' : '❌ ТРЕБУЕТ КОРРЕКТИРОВКИ'}`);
      console.log(`  Рекомендация: ${data.recommendation}`);
    }
  }

  /**
   * Анализ кейсов
   */
  printCaseAnalysis(cases) {
    console.log('\n📦 АНАЛИЗ КЕЙСОВ');
    console.log('-' * 30);

    for (const [type, data] of Object.entries(cases)) {
      console.log(`\n${type.toUpperCase()}:`);
      console.log(`  Цена: ${data.price}₽`);
      console.log(`  Ожидаемая стоимость: ${data.expectedValue}₽`);
      console.log(`  Прибыль: ${data.profit.toFixed(2)}₽`);
      console.log(`  Рентабельность: ${(data.profitMargin * 100).toFixed(1)}%`);
      console.log(`  Статус: ${data.isOptimal ? '✅ ОПТИМАЛЬНО' : '❌ ТРЕБУЕТ КОРРЕКТИРОВКИ'}`);
      console.log(`  Рекомендация: ${data.recommendation}`);
    }
  }

  /**
   * Анализ бесплатных активностей
   */
  printFreeActivitiesAnalysis(freeActivities) {
    console.log('\n🎮 АНАЛИЗ БЕСПЛАТНЫХ АКТИВНОСТЕЙ');
    console.log('-' * 30);

    for (const [activity, data] of Object.entries(freeActivities)) {
      console.log(`\n${activity.toUpperCase()}:`);
      console.log(`  Частота: ${data.frequency}`);
      if (data.maxReward) console.log(`  Макс. награда: ${data.maxReward}`);
      if (data.reward) console.log(`  Награда: ${data.reward}`);
      if (data.winRate) console.log(`  Винрейт: ${data.winRate}`);
      console.log(`  Дневные затраты: ~${data.dailyCost.toFixed(2)}₽`);
      console.log(`  Рекомендация: ${data.recommendation}`);
    }
  }

  /**
   * Анализ торговой системы
   */
  printTradingAnalysis(trading) {
    console.log('\n💱 АНАЛИЗ ТОРГОВОЙ СИСТЕМЫ');
    console.log('-' * 30);

    console.log('\nПРОДАЖА ПРЕДМЕТОВ:');
    console.log(`  Курс: ${(trading.itemSales.sellRate * 100)}% от рыночной`);
    console.log(`  Маржа: ${(trading.itemSales.profitMargin * 100)}%`);
    console.log(`  Статус: ${trading.itemSales.isOptimal ? '✅ ОПТИМАЛЬНО' : '❌ ТРЕБУЕТ КОРРЕКТИРОВКИ'}`);
    console.log(`  Рекомендация: ${trading.itemSales.recommendation}`);

    console.log('\nОБМЕН НА ПОДПИСКУ:');
    console.log(`  Tier 1-2: ${trading.itemExchange.tier1_2.pricePerDay}₽/день`);
    console.log(`  Tier 3: ${trading.itemExchange.tier3.pricePerDay}₽/день`);
    console.log(`  Рекомендация: ${trading.itemExchange.recommendation}`);

    console.log('\nАПГРЕЙДЫ:');
    console.log(`  Шансы успеха: ${trading.upgrades.averageSuccessRate}`);
    console.log(`  Рекомендация: ${trading.upgrades.recommendation}`);
  }

  /**
   * Общий анализ
   */
  printOverallAnalysis(overall) {
    console.log('\n📊 ОБЩИЙ АНАЛИЗ РЕНТАБЕЛЬНОСТИ');
    console.log('-' * 30);

    console.log(`Текущая рентабельность: ${(overall.currentProfitMargin * 100).toFixed(1)}%`);
    console.log(`Целевая рентабельность: ${(overall.targetProfitMargin * 100).toFixed(1)}%`);
    console.log(`Разрыв: ${(overall.gap * 100).toFixed(1)}% ${overall.gap > 0 ? '(нужно увеличить)' : '(можно снизить)'}`);
    console.log(`Статус: ${overall.isOptimal ? '✅ БЛИЗКО К ЦЕЛИ' : '❌ ТРЕБУЮТСЯ ИЗМЕНЕНИЯ'}`);
    console.log(`Рекомендация: ${overall.recommendation}`);
  }

  /**
   * Вывод плана оптимизации
   */
  printOptimizationPlan(plan) {
    console.log(`Приоритет: ${plan.priority}`);
    console.log(`Ожидаемый эффект: ${plan.estimatedImpact}\n`);

    // Изменения в подписках
    console.log('💰 ОПТИМИЗАЦИЯ ПОДПИСОК:');
    const sub = plan.changes.subscriptions;

    console.log('\nЦены:');
    for (const [tier, data] of Object.entries(sub.prices)) {
      const change = ((data.recommended - data.current) / data.current * 100).toFixed(1);
      console.log(`  ${tier}: ${data.current}₽ → ${data.recommended}₽ (${change > 0 ? '+' : ''}${change}%)`);
      console.log(`    Обоснование: ${data.reasoning}`);
    }

    console.log('\nБонусы:');
    console.log(`  Текущие: ${sub.bonuses.current}`);
    console.log(`  Рекомендуемые: ${sub.bonuses.recommended}`);
    console.log(`  Обоснование: ${sub.bonuses.reasoning}`);

    // Изменения в кейсах
    console.log('\n📦 ОПТИМИЗАЦИЯ КЕЙСОВ:');
    const cases = plan.changes.cases;

    console.log('\nОжидаемые стоимости:');
    for (const [type, data] of Object.entries(cases.expectedValues)) {
      const change = ((data.currentEV - data.recommendedEV) / data.currentEV * 100).toFixed(1);
      console.log(`  ${type}: ${data.currentEV}₽ → ${data.recommendedEV}₽ (-${change}%)`);
      console.log(`    ${data.priceChange}`);
    }

    console.log('\nВеса предметов:');
    console.log(`  Дорогие: ${cases.dropWeights.expensive}`);
    console.log(`  Дешевые: ${cases.dropWeights.cheap}`);

    // Бесплатные активности
    console.log('\n🎮 ОПТИМИЗАЦИЯ БЕСПЛАТНЫХ АКТИВНОСТЕЙ:');
    const free = plan.changes.freeActivities;

    for (const [activity, data] of Object.entries(free)) {
      console.log(`\n${activity.toUpperCase()}:`);
      console.log(`  Текущее: ${data.current}`);
      console.log(`  Рекомендуемое: ${data.recommended}`);
      console.log(`  Обоснование: ${data.reasoning}`);
    }

    // Торговая система
    console.log('\n💱 ОПТИМИЗАЦИЯ ТОРГОВОЙ СИСТЕМЫ:');
    const trading = plan.changes.trading;

    console.log('\nКурс продажи предметов:');
    console.log(`  Текущий: ${(trading.sellRate.current * 100)}%`);
    console.log(`  Рекомендуемый: ${(trading.sellRate.recommended * 100)}%`);
    console.log(`  Обоснование: ${trading.sellRate.reasoning}`);

    console.log('\nОбменные курсы:');
    for (const [tier, data] of Object.entries(trading.exchangeRates)) {
      console.log(`  ${tier}: ${data.current}₽ → ${data.recommended}₽`);
      console.log(`    Обоснование: ${data.reasoning}`);
    }

    // Вероятности
    console.log('\n🎲 ОПТИМИЗАЦИЯ ВЕРОЯТНОСТЕЙ:');
    const prob = plan.changes.probabilities;

    console.log('\nВеса дропов:');
    for (const [category, data] of Object.entries(prob.dropWeights)) {
      const change = ((data.recommended - data.current) / data.current * 100).toFixed(1);
      console.log(`  ${category}: ${data.current} → ${data.recommended} (${change > 0 ? '+' : ''}${change}%)`);
    }

    console.log('\nЛимиты бонусов:');
    console.log(`  Максимальный бонус: ${prob.bonusLimits.maxBonus.current} → ${prob.bonusLimits.maxBonus.recommended}`);
    console.log(`  Обоснование: ${prob.bonusLimits.maxBonus.reasoning}`);

    // Этапы внедрения
    console.log('\n🚀 ЭТАПЫ ВНЕДРЕНИЯ:');
    for (const step of plan.implementation) {
      console.log(`\n${step.step}. ${step.title}`);
      console.log(`   Приоритет: ${step.priority}`);
      console.log(`   Сложность: ${step.effort}`);
      console.log(`   Файлы: ${step.files.join(', ')}`);
      console.log(`   Влияние: ${step.impact}`);
    }
  }

  /**
   * Сохранение результатов в файл
   */
  saveResults(analysis, plan) {
    const results = {
      timestamp: new Date().toISOString(),
      analysis: analysis,
      optimizationPlan: plan,
      summary: {
        currentProfitability: analysis.overall.currentProfitMargin,
        targetProfitability: analysis.overall.targetProfitMargin,
        gap: analysis.overall.gap,
        priorityChanges: plan.implementation.filter(step => step.priority === 'КРИТИЧНО' || step.priority === 'ВЫСОКИЙ')
      }
    };

    const outputPath = path.join(__dirname, '../.same/economy-analysis.json');
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

    console.log(`\n💾 Результаты сохранены в: ${outputPath}`);

    return results;
  }

  /**
   * Генерация конкретных изменений для файлов
   */
  generateFileChanges(plan) {
    const changes = [];

    // Изменения в buySubscription.js
    changes.push({
      file: 'controllers/user/buySubscription.js',
      description: 'Обновление цен подписок',
      changes: [
        {
          line: '10-12',
          current: `1: { days: 30, max_daily_cases: 1, bonus_percentage: 3.0, name: 'Статус', price: 1210 },
  2: { days: 30, max_daily_cases: 1, bonus_percentage: 5.0, name: 'Статус+', price: 2890 },
  3: { days: 30, max_daily_cases: 1, bonus_percentage: 8.0, name: 'Статус++', price: 6819 }`,
          recommended: `1: { days: 30, max_daily_cases: 1, bonus_percentage: 2.0, name: 'Статус', price: 1450 },
  2: { days: 30, max_daily_cases: 1, bonus_percentage: 3.0, name: 'Статус+', price: 3200 },
  3: { days: 30, max_daily_cases: 1, bonus_percentage: 5.0, name: 'Статус++', price: 6819 }`
        }
      ]
    });

    // Изменения в sellItem.js
    changes.push({
      file: 'controllers/user/sellItem.js',
      description: 'Повышение процента продажи предметов',
      changes: [
        {
          line: '63',
          current: 'const sellPrice = Math.round(itemPrice * 0.65);',
          recommended: 'const sellPrice = Math.round(itemPrice * 0.85);'
        }
      ]
    });

    // Изменения в exchangeItemForSubscription.js
    changes.push({
      file: 'controllers/user/exchangeItemForSubscription.js',
      description: 'Увеличение стоимости дня подписки при обмене',
      changes: [
        {
          line: '47-51',
          current: `if (currentTier === 3) {
      pricePerDay = 300; // 300₽ за день для тарифа "Статус++"
    } else {
      pricePerDay = 150; // 150₽ за день для тарифов "Статус" и "Статус+"
    }`,
          recommended: `if (currentTier === 3) {
      pricePerDay = 350; // 350₽ за день для тарифа "Статус++"
    } else {
      pricePerDay = 200; // 200₽ за день для тарифов "Статус" и "Статус+"
    }`
        }
      ]
    });

    // Изменения в playRoulette.js
    changes.push({
      file: 'controllers/user/playRoulette.js',
      description: 'Снижение наград в рулетке',
      changes: [
        {
          line: '5-15',
          current: `const ROULETTE_SEGMENTS = [
  { id: 0, type: 'empty', value: 0, weight: 15 },      // Пустая секция
  { id: 1, type: 'sub_1_day', value: 1, weight: 8 },   // 1 день подписки (менее вероятно)
  { id: 2, type: 'empty', value: 0, weight: 15 },      // Пустая секция
  { id: 3, type: 'empty', value: 0, weight: 15 },      // Пустая секция
  { id: 4, type: 'sub_2_days', value: 2, weight: 4 },  // 2 дня подписки (редко)
  { id: 5, type: 'empty', value: 0, weight: 15 },      // Пустая секция
  { id: 6, type: 'empty', value: 0, weight: 15 },      // Пустая секция
  { id: 7, type: 'empty', value: 0, weight: 15 },      // Пустая секция
  { id: 8, type: 'empty', value: 0, weight: 15 }       // Пустая секция
];`,
          recommended: `const ROULETTE_SEGMENTS = [
  { id: 0, type: 'empty', value: 0, weight: 20 },      // Пустая секция
  { id: 1, type: 'sub_1_day', value: 1, weight: 5 },   // 1 день подписки (реже)
  { id: 2, type: 'empty', value: 0, weight: 20 },      // Пустая секция
  { id: 3, type: 'empty', value: 0, weight: 20 },      // Пустая секция
  { id: 4, type: 'sub_1_day', value: 1, weight: 2 },   // 1 день подписки (редко)
  { id: 5, type: 'empty', value: 0, weight: 20 },      // Пустая секция
  { id: 6, type: 'empty', value: 0, weight: 20 },      // Пустая секция
  { id: 7, type: 'empty', value: 0, weight: 20 },      // Пустая секция
  { id: 8, type: 'empty', value: 0, weight: 20 }       // Пустая секция
];`
        },
        {
          line: '21',
          current: 'const ROULETTE_COOLDOWN = 6 * 60 * 1000;',
          recommended: 'const ROULETTE_COOLDOWN = 12 * 60 * 60 * 1000; // 12 часов'
        }
      ]
    });

    // Изменения в playSlot.js
    changes.push({
      file: 'controllers/user/playSlot.js',
      description: 'Снижение шансов дорогих выигрышей в слотах',
      changes: [
        {
          line: '18-22',
          current: `const SLOT_OUTCOME_WEIGHTS = {
  'cheap_win': 60,      // 60% шанс - выигрыш дешевого предмета (1-12₽)
  'lose': 30,           // 30% шанс - проигрыш (предметы не совпадают)
  'expensive_win': 10   // 10% шанс - выигрыш дорогого предмета (12-5000₽)
};`,
          recommended: `const SLOT_OUTCOME_WEIGHTS = {
  'cheap_win': 70,      // 70% шанс - выигрыш дешевого предмета (1-12₽)
  'lose': 25,           // 25% шанс - проигрыш (предметы не совпадают)
  'expensive_win': 5    // 5% шанс - выигрыш дорогого предмета (12-5000₽)
};`
        }
      ]
    });

    // Изменения в dropWeightCalculator.js
    changes.push({
      file: 'utils/dropWeightCalculator.js',
      description: 'Корректировка весов предметов по ценам',
      changes: [
        {
          line: '32-44',
          current: `  if (price >= 50000) return 0.005;     // 0.5% - легендарные
  if (price >= 30000) return 0.008;     // 0.8% - мифические
  if (price >= 20000) return 0.015;     // 1.5% - эпические
  if (price >= 15000) return 0.025;     // 2.5% - очень редкие
  if (price >= 10000) return 0.04;      // 4% - редкие
  if (price >= 8000) return 0.06;       // 6% - необычные+
  if (price >= 5000) return 0.1;        // 10% - необычные
  if (price >= 3000) return 0.2;        // 20% - обычные+
  if (price >= 1000) return 0.35;       // 35% - обычные
  if (price >= 500) return 0.5;         // 50% - частые
  if (price >= 100) return 0.7;         // 70% - очень частые
  return 1.0;                           // 100% - базовые/дешевые`,
          recommended: `  if (price >= 50000) return 0.003;     // 0.3% - легендарные
  if (price >= 30000) return 0.006;     // 0.6% - мифические
  if (price >= 20000) return 0.01;      // 1% - эпические
  if (price >= 15000) return 0.02;      // 2% - очень редкие
  if (price >= 10000) return 0.03;      // 3% - редкие
  if (price >= 8000) return 0.05;       // 5% - необычные+
  if (price >= 5000) return 0.08;       // 8% - необычные
  if (price >= 3000) return 0.15;       // 15% - обычные+
  if (price >= 1000) return 0.3;        // 30% - обычные
  if (price >= 500) return 0.4;         // 40% - частые
  if (price >= 100) return 0.8;         // 80% - очень частые
  return 1.2;                           // 120% - базовые/дешевые`
        }
      ]
    });

    return changes;
  }
}

// Основная функция
async function main() {
  const analyzer = new EconomyAnalyzer();

  try {
    console.log('🚀 ЗАПУСК АНАЛИЗА ЭКОНОМИКИ ИГРЫ');
    console.log('Цель: настройка рентабельности на 20-25%\n');

    // Анализ текущего состояния
    const analysis = analyzer.analyzeEconomy();

    // Генерация плана оптимизации
    const plan = analyzer.generateOptimizationPlan();

    // Сохранение результатов
    const results = analyzer.saveResults(analysis, plan);

    // Генерация конкретных изменений
    const fileChanges = analyzer.generateFileChanges(plan);

    console.log('\n🔧 КОНКРЕТНЫЕ ИЗМЕНЕНИЯ В ФАЙЛАХ:');
    console.log('=' * 50);

    for (const change of fileChanges) {
      console.log(`\n📁 ${change.file}`);
      console.log(`📝 ${change.description}`);

      for (const edit of change.changes) {
        console.log(`\n  Строки ${edit.line}:`);
        console.log(`  ТЕКУЩЕЕ:`);
        console.log(`    ${edit.current.split('\n').join('\n    ')}`);
        console.log(`  РЕКОМЕНДУЕМОЕ:`);
        console.log(`    ${edit.recommended.split('\n').join('\n    ')}`);
      }
    }

    console.log('\n✅ АНАЛИЗ ЗАВЕРШЕН');
    console.log(`📊 Текущая рентабельность: ${(results.summary.currentProfitability * 100).toFixed(1)}%`);
    console.log(`🎯 Целевая рентабельность: ${(results.summary.targetProfitability * 100).toFixed(1)}%`);
    console.log(`📈 Необходимое улучшение: ${(Math.abs(results.summary.gap) * 100).toFixed(1)}%`);
    console.log(`🚨 Приоритетных изменений: ${results.summary.priorityChanges.length}`);

  } catch (error) {
    console.error('❌ Ошибка при анализе экономики:', error);
    process.exit(1);
  }
}

// Запуск если вызван напрямую
if (require.main === module) {
  main();
}

module.exports = { EconomyAnalyzer };
