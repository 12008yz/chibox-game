const { logger } = require('./logger');

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
      tier1: { price: 1450, bonus: 2, dailyCases: 1 },
      tier2: { price: 3200, bonus: 3, dailyCases: 1 },
      tier3: { price: 6819, bonus: 5, dailyCases: 1 }
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

      analysis[tier] = {
        monthlyPrice: data.price,
        monthlyCosts: monthlyCosts,
        dailyCaseCost: dailyCaseCost,
        bonusValue: bonusValue,
        freeActivitiesCost: freeActivitiesCost,
        profit: profit,
        profitMargin: profitMargin,
        isOptimal: profitMargin >= 0.20 && profitMargin <= 0.30,
        recommendation: this.getSubscriptionRecommendation(profitMargin, tier)
      };
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

      analysis[type] = {
        price: data.price,
        expectedValue: data.expectedValue,
        profit: profit,
        profitMargin: profitMargin,
        isOptimal: profitMargin >= 0.20 && profitMargin <= 0.30,
        recommendation: this.getCaseRecommendation(profitMargin, type)
      };
    }

    return analysis;
  }

  /**
   * Анализ бесплатных активностей
   */
  analyzeFreeActivities() {
    return {
      roulette: {
        frequency: "1 раз в день",
        maxReward: "2 дня подписки",
        dailyCost: this.estimateRouletteCost(),
        recommendation: "Уменьшить награды или увеличить кулдаун"
      },
      ticTacToe: {
        frequency: "1-3 раза в день по тарифам",
        reward: "Бонусный кейс",
        dailyCost: this.estimateTicTacToeCost(),
        recommendation: "Ограничить стоимость бонусных кейсов"
      },
      slots: {
        frequency: "1-3 раза в день по тарифам",
        winRate: "60% дешевые + 10% дорогие",
        dailyCost: this.estimateSlotsCost(),
        recommendation: "Снизить вероятности дорогих выигрышей"
      }
    };
  }

  /**
   * Анализ торговой системы
   */
  analyzeTradingSystem() {
    return {
      itemSales: {
        sellRate: 0.65, // 65% от рыночной стоимости (оптимизировано)
        profitMargin: 0.30, // 30% маржа
        isOptimal: true,
        recommendation: "Оптимально"
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
  getSubscriptionOptimizations(subscriptionAnalysis) {
    return {
      prices: {
        tier1: {
          current: 1210,
          recommended: 1450, // +20%
          reasoning: "Увеличить до достижения 25% маржи"
        },
        tier2: {
          current: 2890,
          recommended: 3200, // +11%
          reasoning: "Небольшое увеличение для баланса"
        },
        tier3: {
          current: 6819,
          recommended: 6819, // без изменений
          reasoning: "Уже близко к оптимальной марже"
        }
      },
      bonuses: {
        current: "3%, 5%, 8%",
        recommended: "2%, 3%, 5%",
        reasoning: "Снизить влияние бонусов на дроп-рейты"
      }
    };
  }

  /**
   * Оптимизация кейсов
   */
  getCaseOptimizations(caseAnalysis) {
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
   * Оптимизация бесплатных активностей
   */
  getFreeActivitiesOptimizations(freeAnalysis) {
    return {
      roulette: {
        current: "1-2 дня подписки раз в день",
        recommended: "0-1 день подписки раз в 2 дня",
        reasoning: "Сократить частоту и размер наград"
      },
      ticTacToe: {
        current: "Бонусный кейс за победу",
        recommended: "Ограничить стоимость содержимого до 50₽",
        reasoning: "Контролировать потери от бесплатных кейсов"
      },
      slots: {
        current: "60% дешевые, 10% дорогие выигрыши",
        recommended: "70% дешевые, 5% дорогие выигрыши",
        reasoning: "Снизить долю дорогих выигрышей"
      }
    };
  }

  /**
   * Оптимизация торговой системы
   */
  getTradingOptimizations(tradingAnalysis) {
    return {
      sellRate: {
        current: 0.70,
        recommended: 0.65,
        reasoning: "Снизить до 65% для увеличения маржи"
      },
      exchangeRates: {
        tier1_2: {
          current: 150,
          recommended: 200,
          reasoning: "Увеличить стоимость дня подписки"
        },
        tier3: {
          current: 300,
          recommended: 350,
          reasoning: "Небольшое увеличение для премиум тира"
        }
      },
      upgradeChances: {
        current: "По текущей формуле",
        recommended: "Снизить базовые шансы на 5-10%",
        reasoning: "Увеличить прибыльность системы апгрейдов"
      }
    };
  }

  /**
   * Оптимизация вероятностей
   */
  getProbabilityOptimizations() {
    return {
      dropWeights: {
        consumer: { current: 1.0, recommended: 1.2 },
        industrial: { current: 0.7, recommended: 0.8 },
        milspec: { current: 0.35, recommended: 0.4 },
        restricted: { current: 0.2, recommended: 0.15 },
        classified: { current: 0.1, recommended: 0.08 },
        covert: { current: 0.04, recommended: 0.03 },
        contraband: { current: 0.015, recommended: 0.01 },
        exotic: { current: 0.005, recommended: 0.003 }
      },
      bonusLimits: {
        maxBonus: {
          current: "30%",
          recommended: "20%",
          reasoning: "Ограничить максимальный бонус от всех источников"
        }
      }
    };
  }

  /**
   * Шаги внедрения
   */
  getImplementationSteps() {
    return [
      {
        step: 1,
        title: "Корректировка дроп-рейтов",
        priority: "КРИТИЧНО",
        effort: "Средний",
        files: ["dropWeightCalculator.js", "openCase.js"],
        impact: "5-7% увеличение рентабельности"
      },
      {
        step: 2,
        title: "Настройка цен подписок",
        priority: "ВЫСОКИЙ",
        effort: "Низкий",
        files: ["buySubscription.js"],
        impact: "3-5% увеличение рентабельности"
      },
      {
        step: 3,
        title: "Оптимизация бесплатных активностей",
        priority: "ВЫСОКИЙ",
        effort: "Средний",
        files: ["playRoulette.js", "ticTacToeController.js", "playSlot.js"],
        impact: "2-4% увеличение рентабельности"
      },
      {
        step: 4,
        title: "Корректировка торговой системы",
        priority: "СРЕДНИЙ",
        effort: "Низкий",
        files: ["sellItem.js", "exchangeItemForSubscription.js", "upgradeCalculator.js"],
        impact: "2-3% увеличение рентабельности"
      },
      {
        step: 5,
        title: "Тестирование и мониторинг",
        priority: "ВЫСОКИЙ",
        effort: "Высокий",
        files: ["profitabilityCalculator.js"],
        impact: "Контроль достижения целевой рентабельности"
      }
    ];
  }

  // Вспомогательные методы для оценки затрат
  estimateDailyCaseCost(tier) {
    const expectedValues = { tier1: 40, tier2: 80, tier3: 180 };
    return expectedValues[tier] || 40;
  }

  estimateBonusValue(bonusPercent) {
    // Примерное увеличение стоимости выигрышей от бонуса
    return bonusPercent * 50; // 50₽ базовая стоимость × бонус
  }

  estimateFreeActivitiesCost(tier) {
    const attempts = { tier1: 3, tier2: 4, tier3: 5 }; // рулетка + крестики + слоты
    const avgCost = 25; // средняя стоимость награды
    return (attempts[tier] || 3) * avgCost;
  }

  estimateRouletteCost() {
    // 1 раз в день, 15% шанс на 1-2 дня подписки
    return 0.15 * 1.5 * 50; // 15% шанс × 1.5 дня × 50₽ за день
  }

  estimateTicTacToeCost() {
    // Зависит от тира, примерно 20% винрейт × стоимость кейса
    return 0.20 * 50; // 20% винрейт × 50₽ стоимость бонусного кейса
  }

  estimateSlotsCost() {
    // 70% выигрышей, средняя стоимость выигрыша
    return 0.70 * 15; // 70% выигрышей × 15₽ средний выигрыш
  }

  getSubscriptionRecommendation(margin, tier) {
    if (margin < 0.15) return "КРИТИЧНО: Увеличить цену или снизить затраты";
    if (margin < 0.20) return "Увеличить цену на 10-15%";
    if (margin > 0.30) return "Можно снизить цену для конкурентоспособности";
    return "Оптимально";
  }

  getCaseRecommendation(margin, type) {
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
        avgPrices[category] = 0;
        continue;
      }

      const validPrices = items
        .map(item => item.price_rub || 0)
        .filter(price => price > 0);

      if (validPrices.length === 0) {
        avgPrices[category] = this.getFallbackPrice(category);
      } else {
        // Используем медианную цену для более точного расчета
        avgPrices[category] = this.calculateMedian(validPrices);
      }

      logger.info(`${category}: ${items.length} предметов, средняя цена ₽${avgPrices[category].toFixed(2)}`);
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
    const fallbackPrices = {
      consumer: 8,
      industrial: 20,
      milspec: 90,
      restricted: 500,
      classified: 1500,
      covert: 10000,
      contraband: 30000,
      exotic: 100000
    };

    return fallbackPrices[category] || 10;
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
        if (weights[category] && price > 0) {
          const contribution = (weights[category] / totalWeight) * price;
          const adjustment = (error / currentEV) * contribution * learningRate;

          // Уменьшаем вес если EV слишком высокая, увеличиваем если низкая
          weights[category] = Math.max(0.01, weights[category] - adjustment);
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
      normalized[category] = Math.round((weight / totalWeight * 1000) * 100) / 100;
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
      const price = avgPrices[category] || 0;
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
      const price = avgPrices[category] || 0;
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
