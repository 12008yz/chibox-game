const db = require('../models');

// Функция для симуляции открытия кейса на основе весов предметов
function simulateCaseOpening(items) {
  if (!items || items.length === 0) {
    return null;
  }

  // Рассчитываем общий вес всех предметов
  const totalWeight = items.reduce((sum, item) => sum + (item.drop_weight || 1), 0);

  // Генерируем случайное число от 0 до totalWeight
  const random = Math.random() * totalWeight;

  // Находим выпавший предмет на основе весов
  let currentWeight = 0;
  for (const item of items) {
    currentWeight += (item.drop_weight || 1);
    if (random <= currentWeight) {
      return item;
    }
  }

  // Если что-то пошло не так, возвращаем последний предмет
  return items[items.length - 1];
}

// Функция для тестирования прибыльности кейса
async function testCaseProfitability(caseTemplate, openCount = 20) {
  console.log(`\n🎲 Тестируем кейс: ${caseTemplate.name}`);
  console.log(`💰 Цена кейса: ${caseTemplate.price ? `₽${caseTemplate.price}` : 'Бесплатный'}`);

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

  const results = [];
  let totalSpent = (caseTemplate.price || 0) * openCount;
  let totalWon = 0;

  // Симулируем открытие кейса
  for (let i = 1; i <= openCount; i++) {
    const wonItem = simulateCaseOpening(items);
    const itemValue = wonItem ? (wonItem.price || wonItem.actual_price_rub || 0) : 0;

    totalWon += itemValue;

    results.push({
      opening: i,
      itemName: wonItem ? wonItem.name : 'Unknown',
      itemRarity: wonItem ? wonItem.rarity : 'unknown',
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
  const averageWin = totalWon / openCount;

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
    const percentage = ((stats.count / openCount) * 100).toFixed(1);
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
  simulateCaseOpening
};

// Запуск если вызван напрямую
if (require.main === module) {
  const openCount = process.argv[2] ? parseInt(process.argv[2]) : 20;

  console.log('🎰 Тестирование прибыльности кейсов CS2');
  console.log(`📊 Будет проведено ${openCount} открытий каждого кейса\n`);

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
