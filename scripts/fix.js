const db = require('../models');

// Данные о подписках
const subscriptionTiers = {
  1: { days: 30, max_daily_cases: 1, bonus_percentage: 3.0, name: 'Статус', price: 1210 },
  2: { days: 30, max_daily_cases: 1, bonus_percentage: 5.0, name: 'Статус+', price: 2890 },
  3: { days: 30, max_daily_cases: 1, bonus_percentage: 7.0, name: 'Статус++', price: 6819 }
};

// Система уровней и бонусов
const levelBonuses = {
  1: { bonus_percentage: 0.0, required_xp: 0 },
  2: { bonus_percentage: 0.5, required_xp: 100 },
  3: { bonus_percentage: 1.0, required_xp: 250 },
  4: { bonus_percentage: 1.5, required_xp: 500 },
  5: { bonus_percentage: 2.0, required_xp: 1000 },
  10: { bonus_percentage: 3.0, required_xp: 5000 },
  15: { bonus_percentage: 4.0, required_xp: 15000 },
  20: { bonus_percentage: 5.0, required_xp: 35000 },
  25: { bonus_percentage: 6.0, required_xp: 75000 },
  30: { bonus_percentage: 7.5, required_xp: 150000 }
};

// Функция для получения бонуса за уровень
function getLevelBonus(level) {
  const levelKeys = Object.keys(levelBonuses).map(Number).sort((a, b) => b - a);
  for (const levelKey of levelKeys) {
    if (level >= levelKey) {
      return levelBonuses[levelKey].bonus_percentage;
    }
  }
  return levelBonuses[1].bonus_percentage;
}

// Функция для симуляции открытия кейса на основе весов предметов
// ВАЖНО: Бонусы действуют ТОЛЬКО на бесплатные кейсы!
function simulateCaseOpening(items, subscriptionTier = 0, userLevel = 1, isFreeCase = false) {
  if (!items || items.length === 0) {
    console.log('   ❌ DEBUG: Нет предметов для симуляции');
    return null;
  }

  // Бонусы действуют ТОЛЬКО на бесплатные кейсы!
  let totalBonus = 0;
  if (isFreeCase) {
    const subscriptionBonus = subscriptionTiers[subscriptionTier]?.bonus_percentage || 0;
    const levelBonus = getLevelBonus(userLevel);
    totalBonus = subscriptionBonus + levelBonus;
  }

  // Создаем модифицированные веса с учетом бонусов
  const modifiedItems = items.map(item => {
    let modifiedWeight = item.drop_weight || 1;

    // Бонусы применяются только к бесплатным кейсам и только к редким предметам
    if (isFreeCase && totalBonus > 0 && item.rarity && ['classified', 'covert', 'contraband', 'exotic'].includes(item.rarity)) {
      const bonusMultiplier = 1 + (totalBonus / 100);
      modifiedWeight *= bonusMultiplier;
    }

    return {
      ...item,
      modified_weight: modifiedWeight
    };
  });

  // Рассчитываем общий вес всех предметов
  const totalWeight = modifiedItems.reduce((sum, item) => sum + item.modified_weight, 0);

  if (totalWeight === 0) {
    console.log('   ❌ DEBUG: Общий вес предметов равен 0');
    console.log('   Первые 3 предмета:', modifiedItems.slice(0, 3).map(item => ({ name: item.name, weight: item.modified_weight, originalWeight: item.drop_weight })));
    return null;
  }

  // DEBUG: выводим информацию о весах
  if (actualOpenCount && typeof actualOpenCount !== 'undefined') {
    console.log(`   📊 Общий вес: ${totalWeight.toFixed(4)}, случайное число: ${random.toFixed(4)}`);
  }

  // Генерируем случайное число от 0 до totalWeight
  const random = Math.random() * totalWeight;

  // Находим выпавший предмет на основе весов
  let currentWeight = 0;
  for (const item of modifiedItems) {
    currentWeight += item.modified_weight;
    if (random <= currentWeight) {
      return item;
    }
  }

  // Если что-то пошло не так, возвращаем последний предмет
  return modifiedItems[modifiedItems.length - 1];
}

// Функция для тестирования прибыльности кейса
async function testCaseProfitability(caseTemplate, openCount = 20, subscriptionTier = 0, userLevel = 1) {
  const isFreeCase = !caseTemplate.price || caseTemplate.price === 0;
  const actualOpenCount = isFreeCase ? 40 : openCount; // Бесплатные кейсы тестируем с 40 открытиями

  console.log(`\n🎲 Тестируем кейс: ${caseTemplate.name}`);
  console.log(`💰 Цена кейса: ${caseTemplate.price ? `₽${caseTemplate.price}` : 'Бесплатный'}`);

  if (isFreeCase && subscriptionTier > 0) {
    const sub = subscriptionTiers[subscriptionTier];
    console.log(`👑 Подписка: ${sub.name} (+${sub.bonus_percentage}% к редким предметам)`);
  }

  if (isFreeCase && userLevel > 1) {
    const levelBonus = getLevelBonus(userLevel);
    console.log(`⭐ Уровень: ${userLevel} (+${levelBonus}% к редким предметам)`);
  }

  if (!isFreeCase && (subscriptionTier > 0 || userLevel > 1)) {
    console.log(`ℹ️  ПОКУПНОЙ КЕЙС: Бонусы подписки и уровня НЕ действуют!`);
  }

  console.log(`🔢 Количество открытий: ${actualOpenCount} ${isFreeCase ? '(бесплатный кейс)' : '(платный кейс)'}`);

  // Получаем все предметы кейса
  const items = await caseTemplate.getItems();

  if (!items || items.length === 0) {
    console.log(`❌ В кейсе нет предметов!`);
    return {
      caseName: caseTemplate.name,
      casePrice: caseTemplate.price || 0,
      totalSpent: 0,
      totalWon: 0,
      profit: 0,
      profitPercentage: 0,
      averageWin: 0,
      openings: []
    };
  }

  console.log(`📦 Предметов в кейсе: ${items.length}`);

  // Отладочная информация о весах предметов
  const itemsWithWeights = items.filter(item => item.drop_weight && item.drop_weight > 0);
  const itemsWithoutWeights = items.filter(item => !item.drop_weight || item.drop_weight === 0);
  console.log(`   📊 Предметов с весом > 0: ${itemsWithWeights.length}`);
  console.log(`   ❌ Предметов без веса: ${itemsWithoutWeights.length}`);

  if (itemsWithWeights.length > 0) {
    console.log(`   🔢 Примеры весов: ${itemsWithWeights.slice(0, 3).map(item => `${item.name}: ${item.drop_weight}`).join(', ')}`);
  }

  const results = [];
  let totalSpent = (caseTemplate.price || 0) * actualOpenCount;
  let totalWon = 0;

  // Симулируем открытие кейса
  for (let i = 1; i <= actualOpenCount; i++) {
    const wonItem = simulateCaseOpening(items, subscriptionTier, userLevel, isFreeCase);
    const itemValue = wonItem ? parseFloat(wonItem.price || 0) : 0;

    // Отладочная информация для первых 3 открытий
    if (i <= 3) {
      console.log(`   Debug ${i}: wonItem = ${wonItem ? wonItem.name : 'null'}, rarity = ${wonItem ? wonItem.rarity : 'undefined'}, price = ${wonItem ? wonItem.price : 'undefined'}`);
    }

    totalWon += itemValue;

    results.push({
      opening: i,
      itemName: wonItem ? wonItem.name : 'Unknown',
      itemRarity: wonItem ? wonItem.rarity : 'undefined',
      itemValue: itemValue,
      dropWeight: wonItem ? wonItem.drop_weight : 0
    });

    // Выводим информацию о редких выпадениях
    if (wonItem && ['covert', 'contraband', 'exotic'].includes(wonItem.rarity)) {
      console.log(`   🌟 ${i}. ${wonItem.rarity.toUpperCase()}: ${wonItem.name} - ₽${itemValue.toFixed(2)}`);
    }
  }

  const profit = totalWon - totalSpent;
  const profitPercentage = totalSpent > 0 ? ((profit / totalSpent) * 100) : 0;
  const averageWin = totalWon / actualOpenCount;

  // Выводим статистику
  console.log(`\n📊 Результаты тестирования:`);
  console.log(`   💸 Потрачено: ₽${totalSpent.toFixed(2)}`);
  console.log(`   💰 Выиграно: ₽${totalWon.toFixed(2)}`);
  console.log(`   ${profit >= 0 ? '📈' : '📉'} Прибыль: ₽${profit.toFixed(2)} (${profitPercentage.toFixed(2)}%)`);
  console.log(`   🎯 Средний выигрыш: ₽${averageWin.toFixed(2)}`);

  // Анализ по редкости
  const rarityStats = {};
  results.forEach(result => {
    const rarity = result.itemRarity;
    if (!rarityStats[rarity]) {
      rarityStats[rarity] = { count: 0, totalValue: 0 };
    }
    rarityStats[rarity].count++;
    rarityStats[rarity].totalValue += result.itemValue;
  });

  console.log(`\n🎨 Распределение по редкости:`);
  Object.entries(rarityStats).forEach(([rarity, stats]) => {
    const percentage = ((stats.count / actualOpenCount) * 100).toFixed(1);
    const avgValue = (stats.totalValue / stats.count).toFixed(2);
    console.log(`   ${rarity}: ${stats.count} шт (${percentage}%) - Ср. ₽${avgValue}`);
  });

  return {
    caseName: caseTemplate.name,
    casePrice: caseTemplate.price || 0,
    totalSpent,
    totalWon,
    profit,
    profitPercentage,
    averageWin,
    rarityStats,
    openings: results
  };
}

// Функция для тестирования прибыльности подписок
async function testSubscriptionProfitability(subscriptionTier, userLevel = 25) {
  console.log('\n' + '='.repeat(70));
  console.log(`🔥 ТЕСТИРОВАНИЕ ПОДПИСКИ: ${subscriptionTiers[subscriptionTier].name}`);
  console.log('='.repeat(70));

  const subscription = subscriptionTiers[subscriptionTier];
  console.log(`💰 Цена подписки: ₽${subscription.price} на ${subscription.days} дней`);
  console.log(`📦 Ежедневных кейсов: ${subscription.max_daily_cases}`);
  console.log(`🎯 Бонус к редким предметам: +${subscription.bonus_percentage}% (только для бесплатных кейсов)`);
  console.log(`⭐ Тестируемый уровень: ${userLevel} (+${getLevelBonus(userLevel)}%)`);

  try {
    // Получаем только бесплатные кейсы (ежедневные)
    const freeCaseTemplates = await db.CaseTemplate.findAll({
      where: {
        is_active: true,
        price: null // или используйте нужное условие для бесплатных кейсов
      },
      include: [{
        model: db.Item,
        as: 'items',
        through: { attributes: [] }
      }],
      order: [['sort_order', 'ASC']]
    });

    if (freeCaseTemplates.length === 0) {
      console.log('❌ Не найдено бесплатных кейсов!');
      return null;
    }

    console.log(`\n📦 Найдено бесплатных кейсов: ${freeCaseTemplates.length}`);

    let totalDailyValue = 0;
    const caseResults = [];

    // Тестируем каждый бесплатный кейс
    for (const caseTemplate of freeCaseTemplates) {
      const result = await testCaseProfitability(caseTemplate, 20, subscriptionTier, userLevel);
      caseResults.push(result);

      // Рассчитываем ценность для одного дня (за 40 открытий)
      const dailyValue = result.totalWon;
      totalDailyValue += dailyValue;
    }

    // Рассчитываем ценность за весь период подписки
    const totalSubscriptionValue = totalDailyValue * subscription.days;
    const subscriptionProfit = totalSubscriptionValue - subscription.price;
    const subscriptionProfitPercentage = (subscriptionProfit / subscription.price) * 100;

    console.log('\n' + '='.repeat(70));
    console.log('📊 АНАЛИЗ ПРИБЫЛЬНОСТИ ПОДПИСКИ');
    console.log('='.repeat(70));

    console.log(`💳 Стоимость подписки: ₽${subscription.price}`);
    console.log(`🎁 Средняя ценность в день: ₽${totalDailyValue.toFixed(2)}`);
    console.log(`💎 Общая ценность за ${subscription.days} дней: ₽${totalSubscriptionValue.toFixed(2)}`);

    if (subscriptionProfit > 0) {
      console.log(`📈 Прибыль пользователя: ₽${subscriptionProfit.toFixed(2)} (+${subscriptionProfitPercentage.toFixed(1)}%)`);
      console.log(`⚠️  ПОДПИСКА УБЫТОЧНА для казино! Пользователи получают больше чем платят.`);
    } else {
      console.log(`📉 Убыток пользователя: ₽${Math.abs(subscriptionProfit).toFixed(2)} (${Math.abs(subscriptionProfitPercentage).toFixed(1)}%)`);
      console.log(`✅ ПОДПИСКА ПРИБЫЛЬНА для казино.`);
    }

    // Анализ соотношения цена/ценность
    const valueRatio = totalSubscriptionValue / subscription.price;
    console.log(`\n⚖️  Соотношение ценность/цена: ${valueRatio.toFixed(2)}`);

    if (valueRatio > 1.2) {
      console.log(`❌ КРИТИЧНО: Пользователи получают на ${((valueRatio - 1) * 100).toFixed(1)}% больше чем платят!`);
      console.log(`💡 Рекомендация: Снизить веса редких предметов или уменьшить бонусы подписки`);
    } else if (valueRatio > 1.0) {
      console.log(`⚠️  ВНИМАНИЕ: Пользователи получают на ${((valueRatio - 1) * 100).toFixed(1)}% больше чем платят`);
      console.log(`💡 Рекомендация: Слегка скорректировать баланс в пользу казино`);
    } else if (valueRatio < 0.7) {
      console.log(`📉 Подписка может быть слишком дорогой (ценность только ${(valueRatio * 100).toFixed(1)}%)`);
      console.log(`💡 Рекомендация: Снизить цену или увеличить ценность подписки`);
    } else {
      console.log(`✅ Баланс цена/ценность в пределах нормы (70-100%)`);
    }

    return {
      subscriptionTier,
      subscriptionName: subscription.name,
      subscriptionPrice: subscription.price,
      totalDailyValue,
      totalSubscriptionValue,
      subscriptionProfit,
      subscriptionProfitPercentage,
      valueRatio,
      caseResults,
      userLevel
    };

  } catch (error) {
    console.error('❌ Ошибка при тестировании подписки:', error);
    throw error;
  }
}

// Главная функция для тестирования всех кейсов
async function testAllCases(openCount = 20) {
  console.log('🚀 Начинаем тестирование прибыльности кейсов');
  console.log(`🔢 Количество открытий каждого кейса: ${openCount}\n`);

  try {
    // Получаем все активные кейсы
    const caseTemplates = await db.CaseTemplate.findAll({
      where: { is_active: true },
      include: [{
        model: db.Item,
        as: 'items',
        through: { attributes: [] }
      }],
      order: [['sort_order', 'ASC']]
    });

    if (caseTemplates.length === 0) {
      console.log('❌ Не найдено активных кейсов!');
      return;
    }

    console.log(`📦 Найдено активных кейсов: ${caseTemplates.length}`);

    const allResults = [];
    let totalProfit = 0;
    let totalSpent = 0;
    let totalWon = 0;

    // Тестируем каждый кейс
    for (const caseTemplate of caseTemplates) {
      const result = await testCaseProfitability(caseTemplate, openCount);
      allResults.push(result);

      totalProfit += result.profit;
      totalSpent += result.totalSpent;
      totalWon += result.totalWon;

      // Пауза между тестами
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Общая статистика
    console.log('\n' + '='.repeat(60));
    console.log('📈 ОБЩАЯ СТАТИСТИКА ПО ВСЕМ КЕЙСАМ');
    console.log('='.repeat(60));

    console.log(`💸 Общая сумма потрачена: ₽${totalSpent.toFixed(2)}`);
    console.log(`💰 Общая сумма выиграна: ₽${totalWon.toFixed(2)}`);
    console.log(`${totalProfit >= 0 ? '📈' : '📉'} Общая прибыль: ₽${totalProfit.toFixed(2)}`);

    const overallProfitPercentage = totalSpent > 0 ? ((totalProfit / totalSpent) * 100) : 0;
    console.log(`📊 Общая рентабельность: ${overallProfitPercentage.toFixed(2)}%`);

    const expectedProfitMargin = totalSpent > 0 ? ((-totalProfit / totalSpent) * 100) : 0;
    console.log(`💡 Ваша прибыль как владельца: ${expectedProfitMargin.toFixed(2)}%`);

    // Анализ по типам кейсов
    console.log('\n📋 ДЕТАЛЬНАЯ СТАТИСТИКА ПО КЕЙСАМ:');
    console.log('-'.repeat(80));
    console.log('Кейс'.padEnd(25) + 'Цена'.padEnd(10) + 'Прибыль'.padEnd(12) + 'Рентабельность'.padEnd(15) + 'Статус');
    console.log('-'.repeat(80));

    allResults.forEach(result => {
      const priceStr = result.casePrice > 0 ? `₽${result.casePrice}` : 'Бесплатно';
      const profitStr = `₽${result.profit.toFixed(0)}`;
      const percentStr = `${result.profitPercentage.toFixed(1)}%`;
      const status = result.profit < 0 ? '✅ Прибыльно' : '❌ Убыточно';

      console.log(
        result.caseName.substring(0, 24).padEnd(25) +
        priceStr.padEnd(10) +
        profitStr.padEnd(12) +
        percentStr.padEnd(15) +
        status
      );
    });

    // Рекомендации
    console.log('\n💡 РЕКОМЕНДАЦИИ:');
    const unprofitableCases = allResults.filter(r => r.profit > 0);
    const profitableCases = allResults.filter(r => r.profit < 0);

    if (unprofitableCases.length > 0) {
      console.log(`⚠️  Убыточные кейсы (${unprofitableCases.length}): Игроки получают больше чем платят`);
      unprofitableCases.forEach(c => {
        console.log(`   - ${c.caseName}: игроки получают +${Math.abs(c.profitPercentage).toFixed(1)}% прибыли`);
      });
      console.log('   💡 Рекомендация: Увеличить веса дешевых предметов или уменьшить веса дорогих');
    }

    if (profitableCases.length > 0) {
      console.log(`✅ Прибыльные кейсы (${profitableCases.length}): Обеспечивают доход`);
      console.log(`   💰 Средняя прибыльность: ${(profitableCases.reduce((sum, c) => sum + Math.abs(c.profitPercentage), 0) / profitableCases.length).toFixed(1)}%`);
    }

    if (overallProfitPercentage < -15 || overallProfitPercentage > -25) {
      console.log(`\n⚖️  БАЛАНС: Целевая прибыль 20%, текущая ${Math.abs(overallProfitPercentage).toFixed(1)}%`);
      if (overallProfitPercentage > -15) {
        console.log('   📉 Прибыль ниже целевой - нужно снизить выплаты игрокам');
      } else {
        console.log('   📈 Прибыль выше целевой - можно улучшить выплаты игрокам');
      }
    } else {
      console.log('\n✅ БАЛАНС: Прибыльность находится в целевом диапазоне 20±5%');
    }

    return allResults;

  } catch (error) {
    console.error('❌ Ошибка при тестировании кейсов:', error);
    throw error;
  }
}

// Экспорт функций
module.exports = {
  testAllCases,
  testCaseProfitability,
  testSubscriptionProfitability,
  simulateCaseOpening,
  subscriptionTiers,
  levelBonuses,
  getLevelBonus
};

// Запуск если вызван напрямую
if (require.main === module) {
  const args = process.argv.slice(2);
  const mode = args[0] || 'cases'; // 'cases', 'subscription', 'all'

  if (mode === 'subscription') {
    const tier = parseInt(args[1]) || 1;
    const level = parseInt(args[2]) || 25;

    console.log('👑 Тестирование прибыльности подписок CS2');
    console.log(`📊 Тестируем подписку уровня ${tier} для пользователя ${level} уровня\n`);

    testSubscriptionProfitability(tier, level)
      .then(() => {
        console.log('\n🎉 Тестирование подписки завершено!');
        console.log('💡 Используйте эти данные для настройки цен и бонусов подписок');
        process.exit(0);
      })
      .catch(error => {
        console.error('❌ Ошибка:', error);
        process.exit(1);
      });

  } else if (mode === 'all') {
    console.log('🚀 ПОЛНОЕ ТЕСТИРОВАНИЕ: Кейсы + Все подписки');
    console.log('='.repeat(60));

    const openCount = parseInt(args[1]) || 20;

    // Сначала тестируем обычные кейсы
    testAllCases(openCount)
      .then(() => {
        console.log('\n' + '='.repeat(60));
        console.log('🔄 Переходим к тестированию подписок...');
        console.log('='.repeat(60));

        // Затем тестируем все подписки
        const subscriptionTests = [1, 2, 3].map(tier =>
          testSubscriptionProfitability(tier, 25)
        );

        return Promise.all(subscriptionTests);
      })
      .then(() => {
        console.log('\n' + '='.repeat(60));
        console.log('🎉 ПОЛНОЕ ТЕСТИРОВАНИЕ ЗАВЕРШЕНО!');
        console.log('='.repeat(60));
        console.log('💡 Проанализируйте результаты для оптимизации баланса игры');
        process.exit(0);
      })
      .catch(error => {
        console.error('❌ Ошибка:', error);
        process.exit(1);
      });

  } else {
    // Обычное тестирование кейсов
    const openCount = parseInt(args[1]) || 20;

    console.log('🎰 Тестирование прибыльности кейсов CS2');
    console.log(`📊 Будет проведено ${openCount} открытий каждого кейса`);
    console.log('💡 Используйте: node fix.js subscription [1-3] [уровень] для тестирования подписок');
    console.log('💡 Используйте: node fix.js all [открытий] для полного тестирования\n');

    testAllCases(openCount)
      .then(() => {
        console.log('\n🎉 Тестирование завершено!');
        console.log('💡 Используйте эти данные для настройки весов в fix-drop-weights.js');
        process.exit(0);
      })
      .catch(error => {
        console.error('❌ Ошибка:', error);
        process.exit(1);
      });
  }
}
