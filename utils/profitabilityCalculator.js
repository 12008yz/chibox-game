const { logger } = require('./logger');

function getOwnValue(source, key, fallback = undefined) {
  if (Object.prototype.hasOwnProperty.call(source, key)) {
    return Reflect.get(source, key);
  }
  return fallback;
}

function setOwnValue(target, key, value) {
  Reflect.set(target, key, value);
}

class ProfitabilityCalculator {
  constructor(targetProfitMargin = 0.225) {
    this.targetProfitMargin = targetProfitMargin; // 22.5% прибыль сайта
    this.userReturnRate = 1 - targetProfitMargin; // 77.5% возврат пользователям
  }

  /**
   * АНАЛИЗ ТЕКУЩЕЙ ЭКОНОМИКИ ИГРЫ
   */
  analyzeCurrentEconomy() {
    const analysis = {
      subscriptions: this.analyzeSubscriptions(),
      cases: this.analyzeCases(),
      freeActivities: this.analyzeFreeActivities(),
      trading: this.analyzeTradingSystem(),
      overall: {}
    };

    // Общий анализ
    analysis.overall = this.calculateOverallProfitability(analysis);

    return analysis;
  }

  /**
   * Анализ системы подписок
   */
  analyzeSubscriptions() {
    const subscriptions = {
      tier1: { price: 1811, bonus: 2, dailyCases: 1 },
      tier2: { price: 3666, bonus: 3, dailyCases: 1 },
      tier3: { price: 7580, bonus: 5, dailyCases: 1 }
    };

    const analysis = {};

    for (const [tier, data] of Object.entries(subscriptions)) {
      // Рассчитываем стоимость предоставляемых услуг
      const dailyCaseCost = this.estimateDailyCaseCost(tier);
      const bonusValue = this.estimateBonusValue(data.bonus);
      const freeActivitiesCost = this.estimateFreeActivitiesCost(tier);

      const monthlyCosts = (dailyCaseCost * 30) + bonusValue + freeActivitiesCost;
      const profit = data.price - monthlyCosts;
      const profitMargin = profit / data.price;

      setOwnValue(analysis, tier, {
        monthlyPrice: data.price,
        monthlyCosts: monthlyCosts,
        dailyCaseCost: dailyCaseCost,
        bonusValue: bonusValue,
        freeActivitiesCost: freeActivitiesCost,
        profit: profit,
        profitMargin: profitMargin,
        isOptimal: profitMargin >= 0.20 && profitMargin <= 0.30,
        recommendation: this.getSubscriptionRecommendation(profitMargin, tier)
      });
    }

    return analysis;
  }

  /**
   * Анализ системы кейсов
   */
  analyzeCases() {
    const cases = {
      standard: { price: 99, expectedValue: 79.20 },
      premium: { price: 499, expectedValue: 399.20 }
    };

    const analysis = {};

    for (const [type, data] of Object.entries(cases)) {
      const profit = data.price - data.expectedValue;
      const profitMargin = profit / data.price;

      setOwnValue(analysis, type, {
        price: data.price,
        expectedValue: data.expectedValue,
        profit: profit,
        profitMargin: profitMargin,
        isOptimal: profitMargin >= 0.20 && profitMargin <= 0.30,
        recommendation: this.getCaseRecommendation(profitMargin, type)
      });
    }

    return analysis;
  }

  /**
   * Анализ бесплатных активностей (ОБНОВЛЕНО)
   */
  analyzeFreeActivities() {
    return {
      roulette: {
        frequency: "1 раз в 12 часов",
        maxReward: "1 день подписки",
        winChance: "1.23% (2 из 162 веса)",
        dailyCost: this.estimateRouletteCost(),
        recommendation: "Уже оптимизировано - кулдаун увеличен, награды снижены"
      },
      ticTacToe: {
        frequency: "1-3 раза в день по тарифам",
        reward: "Бонусный кейс (оптимизированный)",
        dailyCost: this.estimateTicTacToeCost(),
        recommendation: "Стоимость бонусных кейсов уже снижена после оптимизации дропов"
      },
      slots: {
        frequency: "Ограничено по тарифам",
        winRate: "60% дешевые + 5% дорогие (оптимизировано)",
        dailyCost: this.estimateSlotsCost(),
        recommendation: "Вероятности дорогих выигрышей уже снижены"
      }
    };
  }

  /**
   * Анализ торговой системы (ОБНОВЛЕНО)
   */
  analyzeTradingSystem() {
    return {
      itemSales: {
        sellRate: 0.85, // 85% от рыночной стоимости (АКТУАЛЬНО из sellItem.js)
        profitMargin: 0.15, // 15% маржа для сайта
        isOptimal: true,
        recommendation: "Оптимально - коэффициент повышен до 85%"
      },
      itemExchange: {
        tier1_2: { pricePerDay: 150, isOptimal: false },
        tier3: { pricePerDay: 300, isOptimal: true },
        recommendation: "Увеличить стоимость дня для tier 1-2 до 200₽"
      },
      upgrades: {
        averageSuccessRate: "20-75%",
        profitMargin: "Зависит от шансов",
        recommendation: "Проанализировать математическое ожидание"
      }
    };
  }

  /**
   * Расчет общей рентабельности
   */
  calculateOverallProfitability(analysis) {
    // Примерные веса доходов по источникам
    const revenueWeights = {
      subscriptions: 0.40,  // 40% дохода
      cases: 0.35,          // 35% дохода
      trading: 0.20,        // 20% дохода
      other: 0.05           // 5% прочее
    };

    // Усредненная рентабельность по подпискам
    const avgSubscriptionMargin = Object.values(analysis.subscriptions)
      .reduce((sum, sub) => sum + sub.profitMargin, 0) / 3;

    // Усредненная рентабельность по кейсам
    const avgCaseMargin = Object.values(analysis.cases)
      .reduce((sum, case_) => sum + case_.profitMargin, 0) / 2;

    // Примерная рентабельность торговли (30% с продаж)
    const tradingMargin = 0.30;

    const weightedMargin =
      (avgSubscriptionMargin * revenueWeights.subscriptions) +
      (avgCaseMargin * revenueWeights.cases) +
      (tradingMargin * revenueWeights.trading);

    return {
      currentProfitMargin: weightedMargin,
      targetProfitMargin: this.targetProfitMargin,
      isOptimal: Math.abs(weightedMargin - this.targetProfitMargin) < 0.05,
      gap: this.targetProfitMargin - weightedMargin,
      recommendation: this.getOverallRecommendation(weightedMargin)
    };
  }

  /**
   * ГЕНЕРАЦИЯ РЕКОМЕНДАЦИЙ ДЛЯ ДОСТИЖЕНИЯ 20-25% РЕНТАБЕЛЬНОСТИ
   */
  generateOptimizationPlan() {
    const analysis = this.analyzeCurrentEconomy();

    const plan = {
      priority: "ВЫСОКИЙ",
      estimatedImpact: "20-25% общая рентабельность",
      changes: {
        subscriptions: this.getSubscriptionOptimizations(analysis.subscriptions),
        cases: this.getCaseOptimizations(analysis.cases),
        freeActivities: this.getFreeActivitiesOptimizations(analysis.freeActivities),
        trading: this.getTradingOptimizations(analysis.trading),
        probabilities: this.getProbabilityOptimizations()
      },
      implementation: this.getImplementationSteps()
    };

    return plan;
  }

  /**
   * Оптимизация подписок
   */
  getSubscriptionOptimizations() {
    return {
      prices: {
        tier1: {
          current: 1811,
          recommended: 1811, // без изменений
          reasoning: "Цена уже скорректирована до оптимального уровня"
        },
        tier2: {
          current: 3666,
          recommended: 3666, // без изменений
          reasoning: "Цена уже скорректирована до оптимального уровня"
        },
        tier3: {
          current: 7580,
          recommended: 7580, // без изменений
          reasoning: "Цена уже скорректирована до оптимального уровня"
        }
      },
      bonuses: {
        current: "2%, 3%, 5%",
        recommended: "2%, 3%, 5%",
        reasoning: "Бонусы уже оптимизированы после корректировки дропов"
      }
    };
  }

  /**
   * Оптимизация кейсов
   */
  getCaseOptimizations() {
    return {
      expectedValues: {
        standard: {
          currentEV: 79.20,
          recommendedEV: 74.25, // 25% маржа
          priceChange: "99₽ → 99₽ (корректировать содержимое)"
        },
        premium: {
          currentEV: 399.20,
          recommendedEV: 374.25, // 25% маржа
          priceChange: "499₽ → 499₽ (корректировать содержимое)"
        }
      },
      dropWeights: {
        expensive: "Снизить веса дорогих предметов на 20-30%",
        cheap: "Увеличить веса дешевых предметов соответственно"
      }
    };
  }

  /**
   * Оптимизация бесплатных активностей (ОБНОВЛЕНО)
   */
  getFreeActivitiesOptimizations() {
    return {
      roulette: {
        current: "1 день подписки раз в 12 часов (1.23% шанс)",
        recommended: "УЖЕ ОПТИМИЗИРОВАНО",
        reasoning: "Кулдаун увеличен до 12 часов, максимальная награда снижена до 1 дня"
      },
      ticTacToe: {
        current: "Бонусный кейс с оптимизированными дропами",
        recommended: "УЖЕ ОПТИМИЗИРОВАНО",
        reasoning: "Стоимость содержимого уже снижена через оптимизацию весов дропов"
      },
      slots: {
        current: "60% дешевые, 5% дорогие выигрыши",
        recommended: "УЖЕ ОПТИМИЗИРОВАНО",
        reasoning: "Доля дорогих выигрышей уже снижена в dropWeightCalculator"
      }
    };
  }

  /**
   * Оптимизация торговой системы (ОБНОВЛЕНО)
   */
  getTradingOptimizations() {
    return {
      sellRate: {
        current: 0.85,
        recommended: 0.85,
        reasoning: "УЖЕ ОПТИМИЗИРОВАНО - коэффициент повышен до 85%"
      },
      exchangeRates: {
        tier1_2: {
          current: "Проверить в exchangeItemForSubscription.js",
          recommended: "Увеличить до 200₽ за день если не сделано",
          reasoning: "Увеличить стоимость дня подписки при обмене"
        },
        tier3: {
          current: "Проверить в exchangeItemForSubscription.js",
          recommended: "Увеличить до 350₽ за день если не сделано",
          reasoning: "Небольшое увеличение для премиум тира"
        }
      },
      upgradeChances: {
        current: "По формуле в upgradeCalculator.js",
        recommended: "Проанализировать текущие шансы успеха",
        reasoning: "Убедиться что система апгрейдов прибыльна"
      }
    };
  }

  /**
   * Оптимизация вероятностей (ОБНОВЛЕНО - УЖЕ ПРИМЕНЕНО)
   */
  getProbabilityOptimizations() {
    return {
      dropWeights: {
        "50000₽+": { current: 0.002, status: "✅ ОПТИМИЗИРОВАНО" },
        "30000₽+": { current: 0.004, status: "✅ ОПТИМИЗИРОВАНО" },
        "20000₽+": { current: 0.007, status: "✅ ОПТИМИЗИРОВАНО" },
        "15000₽+": { current: 0.012, status: "✅ ОПТИМИЗИРОВАНО" },
        "10000₽+": { current: 0.02, status: "✅ ОПТИМИЗИРОВАНО" },
        "8000₽+": { current: 0.03, status: "✅ ОПТИМИЗИРОВАНО" },
        "5000₽+": { current: 0.06, status: "✅ ОПТИМИЗИРОВАНО" },
        "3000₽+": { current: 0.12, status: "✅ ОПТИМИЗИРОВАНО" },
        "1000₽+": { current: 0.28, status: "✅ ОПТИМИЗИРОВАНО" },
        "500₽+": { current: 0.45, status: "✅ ОПТИМИЗИРОВАНО" },
        "100₽+": { current: 0.8, status: "✅ ОПТИМИЗИРОВАНО" },
        "дешевые": { current: 1.2, status: "✅ ОПТИМИЗИРОВАНО" }
      },
      note: "Агрессивная оптимизация весов уже применена в dropWeightCalculator.js",
      bonusLimits: {
        maxBonus: {
          current: "Нужно проверить в userBonusCalculator.js",
          recommended: "Ограничить до 20% если превышает",
          reasoning: "Ограничить максимальный совокупный бонус"
        }
      }
    };
  }

  /**
   * Шаги внедрения (ОБНОВЛЕНО)
   */
  getImplementationSteps() {
    return [
      {
        step: 1,
        title: "Корректировка дроп-рейтов",
        priority: "✅ ВЫПОЛНЕНО",
        effort: "Средний",
        files: ["dropWeightCalculator.js"],
        impact: "5-7% увеличение рентабельности - ПРИМЕНЕНО"
      },
      {
        step: 2,
        title: "Настройка цен подписок",
        priority: "✅ ВЫПОЛНЕНО",
        effort: "Низкий",
        files: ["buySubscription.js"],
        impact: "3-5% увеличение рентабельности - ПРИМЕНЕНО"
      },
      {
        step: 3,
        title: "Оптимизация бесплатных активностей",
        priority: "✅ ВЫПОЛНЕНО",
        effort: "Средний",
        files: ["playRoulette.js"],
        impact: "2-4% увеличение рентабельности - ПРИМЕНЕНО"
      },
      {
        step: 4,
        title: "Корректировка торговой системы",
        priority: "✅ ЧАСТИЧНО ВЫПОЛНЕНО",
        effort: "Низкий",
        files: ["sellItem.js", "exchangeItemForSubscription.js"],
        impact: "Коэффициент продажи 85% применен, нужно проверить обменные курсы"
      },
      {
        step: 5,
        title: "Проверка лимитов бонусов",
        priority: "РЕКОМЕНДУЕТСЯ",
        effort: "Низкий",
        files: ["userBonusCalculator.js"],
        impact: "Убедиться что максимальный бонус не превышает 20%"
      }
    ];
  }

  // Вспомогательные методы для оценки затрат (ОБНОВЛЕНО с актуальными данными)
  estimateDailyCaseCost(tier) {
    switch (tier) {
      case 'tier1': return 25;
      case 'tier2': return 45;
      case 'tier3': return 90;
      default: return 25;
    }
  }

  estimateBonusValue(bonusPercent) {
    // Примерное увеличение стоимости выигрышей от бонуса (снижено после агрессивной оптимизации)
    return bonusPercent * 25; // 25₽ базовая стоимость × бонус (было 50₽)
  }

  estimateFreeActivitiesCost(tier) {
    // Обновлено согласно фактическому кулдауну рулетки (12 часов) и сниженным наградам
    const baseCost = 8; // Рулетка: ~1.23% шанс × 1 день × 60₽ ÷ 2 игры в день
    let multiplier = 1;
    if (tier === 'tier2') multiplier = 1.2;
    if (tier === 'tier3') multiplier = 1.5;
    return baseCost * multiplier;
  }

  estimateRouletteCost() {
    // АКТУАЛЬНЫЕ ДАННЫЕ: 1.23% шанс на 1 день подписки, 12 часов кулдаун
    return 0.0123 * 1 * 60; // 1.23% шанс × 1 день × 60₽ за день
  }

  estimateTicTacToeCost() {
    // Обновлено: бонусный кейс со сниженной стоимостью после оптимизации дропов
    return 0.30 * 25; // 30% винрейт × 25₽ стоимость бонусного кейса
  }

  estimateSlotsCost() {
    // Обновлено согласно оптимизированным весам дропов
    return 0.60 * 10; // 60% выигрышей × 10₽ средний выигрыш (снижено)
  }

  getSubscriptionRecommendation(margin) {
    if (margin < 0.15) return "КРИТИЧНО: Увеличить цену или снизить затраты";
    if (margin < 0.20) return "Увеличить цену на 10-15%";
    if (margin > 0.30) return "Можно снизить цену для конкурентоспособности";
    return "Оптимально";
  }

  getCaseRecommendation(margin) {
    if (margin < 0.20) return "Снизить ожидаемую стоимость содержимого";
    if (margin > 0.30) return "Можно улучшить содержимое";
    return "Оптимально";
  }

  getOverallRecommendation(margin) {
    if (margin < 0.15) return "КРИТИЧНО: Требуются срочные изменения";
    if (margin < 0.20) return "Нужны корректировки для достижения цели";
    if (margin > 0.30) return "Можно снизить цены для роста аудитории";
    return "Близко к целевой рентабельности";
  }

  // Оригинальные методы для обратной совместимости
  calculateOptimalWeights(itemsByCategory, casePrice) {
    const targetExpectedValue = casePrice * this.userReturnRate;

    logger.info(`Расчет весов для кейса ₽${casePrice}:`);
    logger.info(`Целевая ожидаемая стоимость: ₽${targetExpectedValue.toFixed(2)}`);

    // Начальные веса (базовые значения)
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

    // Получаем средние цены по категориям
    const avgPrices = this.calculateAveragePrices(itemsByCategory);

    // Итеративная оптимизация весов
    const optimizedWeights = this.optimizeWeights(baseWeights, avgPrices, targetExpectedValue);

    // Проверяем результат
    const actualEV = this.calculateExpectedValue(optimizedWeights, avgPrices);
    const actualProfit = casePrice - actualEV;
    const actualProfitMargin = actualProfit / casePrice;

    logger.info(`Результат оптимизации:`);
    logger.info(`- Ожидаемая стоимость: ₽${actualEV.toFixed(2)}`);
    logger.info(`- Прибыль: ₽${actualProfit.toFixed(2)}`);
    logger.info(`- Рентабельность: ${(actualProfitMargin * 100).toFixed(1)}%`);

    return {
      weights: optimizedWeights,
      expectedValue: actualEV,
      profitMargin: actualProfitMargin,
      profit: actualProfit,
      isOptimal: Math.abs(actualProfitMargin - this.targetProfitMargin) < 0.02
    };
  }

  /**
   * Рассчитать средние цены по категориям
   */
  calculateAveragePrices(itemsByCategory) {
    const avgPrices = {};

    for (const [category, items] of Object.entries(itemsByCategory)) {
      if (items.length === 0) {
        setOwnValue(avgPrices, category, 0);
        continue;
      }

      const validPrices = items
        .map(item => item.price_rub || 0)
        .filter(price => price > 0);

      if (validPrices.length === 0) {
        setOwnValue(avgPrices, category, this.getFallbackPrice(category));
      } else {
        // Используем медианную цену для более точного расчета
        setOwnValue(avgPrices, category, this.calculateMedian(validPrices));
      }

      const categoryPrice = getOwnValue(avgPrices, category, 0);
      logger.info(`${category}: ${items.length} предметов, средняя цена ₽${categoryPrice.toFixed(2)}`);
    }

    return avgPrices;
  }

  /**
   * Рассчитать медианную цену
   */
  calculateMedian(prices) {
    const sorted = prices.sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    } else {
      return sorted[mid];
    }
  }

  /**
   * Получить fallback цену для категории
   */
  getFallbackPrice(category) {
    switch (category) {
      case 'consumer': return 8;
      case 'industrial': return 20;
      case 'milspec': return 90;
      case 'restricted': return 500;
      case 'classified': return 1500;
      case 'covert': return 10000;
      case 'contraband': return 30000;
      case 'exotic': return 100000;
      default: return 10;
    }
  }

  /**
   * Оптимизация весов методом градиентного спуска
   */
  optimizeWeights(baseWeights, avgPrices, targetEV) {
    let weights = { ...baseWeights };
    const learningRate = 0.1;
    const maxIterations = 100;
    const tolerance = 1; // ₽1 точность

    for (let i = 0; i < maxIterations; i++) {
      const currentEV = this.calculateExpectedValue(weights, avgPrices);
      const error = currentEV - targetEV;

      if (Math.abs(error) < tolerance) {
        logger.info(`Оптимизация завершена за ${i + 1} итераций`);
        break;
      }

      // Корректируем веса пропорционально вкладу в ошибку
      const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);

      for (const [category, price] of Object.entries(avgPrices)) {
        const currentWeight = getOwnValue(weights, category, 0);
        if (currentWeight && price > 0) {
          const contribution = (currentWeight / totalWeight) * price;
          const adjustment = (error / currentEV) * contribution * learningRate;

          // Уменьшаем вес если EV слишком высокая, увеличиваем если низкая
          setOwnValue(weights, category, Math.max(0.01, currentWeight - adjustment));
        }
      }

      // Нормализуем веса
      weights = this.normalizeWeights(weights);
    }

    return weights;
  }

  /**
   * Нормализация весов для поддержания пропорций
   */
  normalizeWeights(weights) {
    const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);
    const normalized = {};

    for (const [category, weight] of Object.entries(weights)) {
      const normalizedWeight = Math.round((weight / totalWeight * 1000) * 100) / 100;
      setOwnValue(normalized, category, normalizedWeight);
    }

    return normalized;
  }

  /**
   * Рассчитать ожидаемую стоимость кейса
   */
  calculateExpectedValue(weights, avgPrices) {
    const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);
    let expectedValue = 0;

    for (const [category, weight] of Object.entries(weights)) {
      const probability = weight / totalWeight;
      const price = getOwnValue(avgPrices, category, 0);
      expectedValue += probability * price;
    }

    return expectedValue;
  }

  /**
   * Валидация рентабельности кейса
   */
  validateCaseProfitability(caseConfig, itemsByCategory) {
    const avgPrices = this.calculateAveragePrices(itemsByCategory);
    const actualEV = this.calculateExpectedValue(caseConfig.drop_weights, avgPrices);
    const actualProfit = caseConfig.price - actualEV;
    const actualProfitMargin = actualProfit / caseConfig.price;

    const status = this.getProfitabilityStatus(actualProfitMargin);

    return {
      caseName: caseConfig.name,
      casePrice: caseConfig.price,
      expectedValue: actualEV,
      profit: actualProfit,
      profitMargin: actualProfitMargin,
      targetMargin: this.targetProfitMargin,
      status: status,
      recommendation: this.getRecommendation(actualProfitMargin),
      breakdown: this.calculateCategoryBreakdown(caseConfig.drop_weights, avgPrices)
    };
  }

  /**
   * Определение статуса рентабельности
   */
  getProfitabilityStatus(actualMargin) {
    const target = this.targetProfitMargin;
    const tolerance = 0.025; // ±2.5%

    if (Math.abs(actualMargin - target) <= tolerance) {
      return '✅ ОПТИМАЛЬНО';
    } else if (actualMargin >= target - 0.05 && actualMargin <= target + 0.05) {
      return '⚠️ ПРИЕМЛЕМО';
    } else if (actualMargin < target - 0.05) {
      return '❌ УБЫТОЧНО';
    } else {
      return '📈 СЛИШКОМ ПРИБЫЛЬНО';
    }
  }

  /**
   * Рекомендации по корректировке
   */
  getRecommendation(actualMargin) {
    const target = this.targetProfitMargin;
    const diff = actualMargin - target;

    if (Math.abs(diff) <= 0.025) {
      return 'Рентабельность в норме';
    } else if (diff < -0.05) {
      return 'Уменьшить веса дорогих предметов или увеличить цену кейса';
    } else if (diff > 0.05) {
      return 'Увеличить веса дорогих предметов или уменьшить цену кейса';
    } else {
      return 'Незначительная корректировка весов';
    }
  }

  /**
   * Детальная разбивка по категориям
   */
  calculateCategoryBreakdown(weights, avgPrices) {
    const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);
    const breakdown = [];

    for (const [category, weight] of Object.entries(weights)) {
      const probability = weight / totalWeight;
      const price = getOwnValue(avgPrices, category, 0);
      const contribution = probability * price;

      breakdown.push({
        category,
        weight,
        probability: probability * 100, // в процентах
        avgPrice: price,
        contribution
      });
    }

    return breakdown.sort((a, b) => b.contribution - a.contribution);
  }

  /**
   * Автоматическая корректировка весов для всех кейсов
   */
  async autoAdjustAllCases(caseConfigs, itemsByCategory) {
    const results = [];

    for (const caseConfig of caseConfigs) {
      if (!caseConfig.price) continue; // Пропускаем бесплатные кейсы

      logger.info(`\nКорректировка кейса: ${caseConfig.name}`);

      const optimization = this.calculateOptimalWeights(
        itemsByCategory,
        caseConfig.price
      );

      results.push({
        caseConfig,
        optimization,
        oldWeights: { ...caseConfig.drop_weights },
        newWeights: optimization.weights
      });
    }

    return results;
  }
}

module.exports = ProfitabilityCalculator;
