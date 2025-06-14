const { logger } = require('./logger');

class ProfitabilityCalculator {
  constructor(targetProfitMargin = 0.2) {
    this.targetProfitMargin = targetProfitMargin; // 20% прибыль сайта
    this.userReturnRate = 1 - targetProfitMargin; // 80% возврат пользователям
  }

  /**
   * Рассчитать оптимальные веса для кейса на основе актуальных цен
   */
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
    const tolerance = 0.02; // ±2%

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

    if (Math.abs(diff) <= 0.02) {
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
