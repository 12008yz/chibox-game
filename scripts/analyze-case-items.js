const { Sequelize } = require('sequelize');
const { CaseTemplate, Item, CaseTemplateItem } = require('../models');
const { calculateCorrectWeightByPrice } = require('../utils/dropWeightCalculator');

async function analyzeCaseItems() {
  try {
    console.log('='.repeat(80));
    console.log('АНАЛИЗ ПОКУПНЫХ КЕЙСОВ');
    console.log('='.repeat(80));
    console.log('');

    // Получаем все покупные кейсы (premium type)
    const premiumCases = await CaseTemplate.findAll({
      where: {
        type: 'premium',
        is_active: true
      },
      order: [['price', 'ASC']]
    });

    if (!premiumCases || premiumCases.length === 0) {
      console.log('❌ Покупные кейсы не найдены!');
      return;
    }

    console.log(`📦 Найдено покупных кейсов: ${premiumCases.length}\n`);

    // Анализируем каждый кейс
    for (const caseTemplate of premiumCases) {
      console.log('━'.repeat(80));
      console.log(`🎁 ${caseTemplate.name.toUpperCase()}`);
      console.log('━'.repeat(80));
      console.log(`💰 Цена: ${caseTemplate.price}₽`);
      console.log(`🆔 ID: ${caseTemplate.id}`);
      console.log('');

      // Получаем все предметы кейса
      const caseItems = await CaseTemplateItem.findAll({
        where: { case_template_id: caseTemplate.id },
        include: [{
          model: Item,
          as: 'item',
          required: true
        }]
      });

      if (!caseItems || caseItems.length === 0) {
        console.log('⚠️  Предметы не найдены!\n');
        continue;
      }

      console.log(`📋 Всего предметов в кейсе: ${caseItems.length}\n`);

      // Определяем тип кейса для правильного расчета весов
      let caseType = 'premium';
      const price = caseTemplate.price;

      if (price === 17) caseType = 'bronze_17';
      else if (price === 49) caseType = 'fluffy_49';
      else if (price === 99) caseType = 'standard_99';
      else if (price === 101) caseType = 'gold_101';
      else if (price === 250) caseType = 'platinum_250';
      else if (price === 601) caseType = 'diamond_601';
      else if (price === 998) caseType = 'legendary_998';
      else if (price === 2499) caseType = 'mystic_2499';
      else if (price === 5000) caseType = 'epic_5000';
      else if (price === 10000) caseType = 'mythic_10000';

      // Подготавливаем данные предметов
      const items = caseItems.map(ci => ({
        id: ci.item.id,
        name: ci.item.name,
        price: parseFloat(ci.item.price) || 0,
        rarity: ci.item.rarity
      }));

      // Рассчитываем веса для каждого предмета
      const itemsWithWeights = items.map(item => {
        const weight = calculateCorrectWeightByPrice(item.price, caseType);
        return {
          ...item,
          weight,
          ratio: (item.price / caseTemplate.price).toFixed(2)
        };
      });

      // Сортируем по цене (от дорогих к дешевым)
      itemsWithWeights.sort((a, b) => b.price - a.price);

      // Общий вес
      const totalWeight = itemsWithWeights.reduce((sum, item) => sum + item.weight, 0);

      // Средняя стоимость выигрыша
      const avgWin = itemsWithWeights.reduce((sum, item) => {
        const chance = item.weight / totalWeight;
        return sum + (item.price * chance);
      }, 0);

      const rtp = ((avgWin / caseTemplate.price) * 100).toFixed(2);

      console.log(`📊 СТАТИСТИКА:`);
      console.log(`   Средний выигрыш: ${avgWin.toFixed(2)}₽`);
      console.log(`   RTP: ${rtp}%`);
      console.log('');

      // Группируем предметы по ценовым категориям
      const categories = {
        'Джекпоты (>2x)': itemsWithWeights.filter(i => parseFloat(i.ratio) >= 2),
        'Хорошие (1-2x)': itemsWithWeights.filter(i => parseFloat(i.ratio) >= 1 && parseFloat(i.ratio) < 2),
        'Окуп (0.8-1x)': itemsWithWeights.filter(i => parseFloat(i.ratio) >= 0.8 && parseFloat(i.ratio) < 1),
        'Средние (0.4-0.8x)': itemsWithWeights.filter(i => parseFloat(i.ratio) >= 0.4 && parseFloat(i.ratio) < 0.8),
        'Дешевые (<0.4x)': itemsWithWeights.filter(i => parseFloat(i.ratio) < 0.4)
      };

      for (const [categoryName, categoryItems] of Object.entries(categories)) {
        if (categoryItems.length === 0) continue;

        const categoryWeight = categoryItems.reduce((sum, item) => sum + item.weight, 0);
        const categoryChance = ((categoryWeight / totalWeight) * 100).toFixed(2);

        console.log(`\n${categoryName} (${categoryItems.length} шт., ${categoryChance}% шанс):`);
        console.log('─'.repeat(80));

        // Показываем топ-10 предметов в категории
        categoryItems.slice(0, 10).forEach((item, index) => {
          const chance = ((item.weight / totalWeight) * 100).toFixed(4);
          console.log(`${(index + 1).toString().padStart(2)}. ${item.name.substring(0, 40).padEnd(40)} | ${item.price.toFixed(2).padStart(8)}₽ | x${item.ratio} | ${chance.padStart(7)}%`);
        });

        if (categoryItems.length > 10) {
          console.log(`    ... и еще ${categoryItems.length - 10} предметов`);
        }
      }

      console.log('\n');
    }

    console.log('='.repeat(80));
    console.log('✅ Анализ завершен!');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('❌ Ошибка при анализе:', error);
  } finally {
    process.exit(0);
  }
}

// Запускаем анализ
analyzeCaseItems();
