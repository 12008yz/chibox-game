const { CaseTemplate, Item, CaseTemplateItem } = require('../models');
const { calculateCorrectWeightByPrice, determineCaseType } = require('../utils/dropWeightCalculator');

// Все кейсы из сидеров
const ALL_CASES = [
  { id: '11111111-1111-1111-1111-111111111111', name: 'Ежедневный кейс - Бесплатный', type: 'daily', price: 0 },
  { id: '22222222-2222-2222-2222-222222222222', name: 'Ежедневный кейс - Статус', type: 'daily', price: 0 },
  { id: '33333333-3333-3333-3333-333333333333', name: 'Ежедневный кейс - Статус+', type: 'daily', price: 0 },
  { id: '44444444-4444-4444-4444-444444444444', name: 'Ежедневный кейс - Статус++', type: 'daily', price: 0 },
  { id: '55555555-5555-5555-5555-555555555555', name: 'Бонусный кейс', type: 'special', price: 0 },
  { id: '66666666-6666-6666-6666-666666666666', name: 'Стандартный кейс', type: 'premium', price: 99 },
  { id: '77777777-7777-7777-7777-777777777777', name: 'Премиум кейс', type: 'premium', price: 499 },
  { id: '88888888-8888-8888-8888-888888888888', name: 'Бронзовый кейс', type: 'premium', price: 17 },
  { id: '99999999-9999-9999-9999-999999999999', name: 'Пушистый кейс', type: 'premium', price: 49 },
  { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', name: 'Золотой кейс', type: 'premium', price: 101 },
  { id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', name: 'Платиновый кейс', type: 'premium', price: 250 },
  { id: 'cccccccc-cccc-cccc-cccc-cccccccccccc', name: 'Алмазный кейс', type: 'premium', price: 601 },
  { id: 'dddddddd-dddd-dddd-dddd-dddddddddddd', name: 'Легендарный кейс', type: 'premium', price: 998 },
  { id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', name: 'Мистический кейс', type: 'premium', price: 2499 },
  { id: 'ffffffff-ffff-ffff-ffff-ffffffffffff', name: 'Эпический кейс', type: 'premium', price: 5000 },
  { id: '10101010-1010-1010-1010-101010101010', name: 'Мифический кейс', type: 'premium', price: 10000 },
];

async function generateSummary() {
  try {
    console.log('='.repeat(120));
    console.log('📋 СВОДКА ПО ВСЕМ КЕЙСАМ ИЗ СИДЕРОВ');
    console.log('='.repeat(120));
    console.log('');

    const results = [];

    for (const caseInfo of ALL_CASES) {
      const caseTemplate = await CaseTemplate.findByPk(caseInfo.id);
      
      if (!caseTemplate) {
        results.push({ ...caseInfo, found: false, itemsCount: 0 });
        continue;
      }

      const caseTemplateItems = await CaseTemplateItem.findAll({
        where: { case_template_id: caseInfo.id },
        attributes: ['item_id'],
        raw: true
      });

      const itemsCount = caseTemplateItems.length;
      
      if (itemsCount === 0) {
        results.push({ ...caseInfo, found: true, active: caseTemplate.is_active, itemsCount: 0 });
        continue;
      }

      const itemIds = caseTemplateItems.map(cti => cti.item_id);
      const caseItems = await Item.findAll({ where: { id: itemIds } });

      const caseType = determineCaseType(caseTemplate, caseInfo.price > 0);
      
      const items = caseItems.map(item => ({
        price: parseFloat(item.price) || 0
      }));

      const itemsWithWeights = items.map(item => ({
        weight: calculateCorrectWeightByPrice(item.price, caseType)
      }));

      const totalWeight = itemsWithWeights.reduce((sum, item) => sum + item.weight, 0);
      
      let avgWin = 0;
      let rtp = 0;
      if (caseInfo.price > 0 && totalWeight > 0) {
        avgWin = items.reduce((sum, item, idx) => {
          const chance = itemsWithWeights[idx].weight / totalWeight;
          return sum + (item.price * chance);
        }, 0);
        rtp = ((avgWin / caseInfo.price) * 100);
      }

      // Находим самый редкий и самый частый предмет
      const itemsWithChances = items.map((item, idx) => ({
        price: item.price,
        chance: totalWeight > 0 ? (itemsWithWeights[idx].weight / totalWeight * 100) : 0
      }));

      itemsWithChances.sort((a, b) => a.chance - b.chance);
      const rarest = itemsWithChances[0];
      const mostCommon = itemsWithChances[itemsWithChances.length - 1];

      results.push({
        ...caseInfo,
        found: true,
        active: caseTemplate.is_active,
        itemsCount,
        caseType,
        rtp: caseInfo.price > 0 ? rtp : null,
        rarestChance: rarest ? rarest.chance : 0,
        mostCommonChance: mostCommon ? mostCommon.chance : 0
      });
    }

    // Выводим таблицу
    console.log('Кейс'.padEnd(50) + ' | Цена'.padStart(10) + ' | Предметов'.padStart(12) + ' | RTP'.padStart(10) + ' | Тип расчета'.padStart(20) + ' | Статус');
    console.log('─'.repeat(120));

    results.forEach(result => {
      const name = result.name.substring(0, 48).padEnd(50);
      const price = result.price > 0 ? `${result.price}₽`.padStart(10) : 'Беспл.'.padStart(10);
      const itemsCount = result.itemsCount.toString().padStart(12);
      const rtp = result.rtp !== null ? `${result.rtp.toFixed(2)}%`.padStart(10) : 'N/A'.padStart(10);
      const caseType = (result.caseType || 'N/A').padStart(20);
      const status = result.found 
        ? (result.active ? '✅ Активен' : '⚠️  Неактивен')
        : '❌ Не найден';
      
      console.log(`${name} | ${price} | ${itemsCount} | ${rtp} | ${caseType} | ${status}`);
    });

    console.log('\n');
    console.log('='.repeat(120));
    console.log('📊 ДЕТАЛЬНАЯ ИНФОРМАЦИЯ ПО ВЕРОЯТНОСТЯМ');
    console.log('='.repeat(120));
    console.log('');

    for (const result of results.filter(r => r.found && r.itemsCount > 0)) {
      console.log(`\n🎁 ${result.name}`);
      console.log(`   Предметов: ${result.itemsCount}`);
      if (result.price > 0) {
        console.log(`   RTP: ${result.rtp.toFixed(2)}%`);
      }
      console.log(`   Тип расчета весов: ${result.caseType}`);
      console.log(`   Самый редкий предмет: ${result.rarestChance.toFixed(4)}%`);
      console.log(`   Самый частый предмет: ${result.mostCommonChance.toFixed(4)}%`);
    }

    console.log('\n');
    console.log('='.repeat(120));
    console.log('✅ Анализ завершен!');
    console.log('='.repeat(120));

  } catch (error) {
    console.error('❌ Ошибка:', error);
    console.error(error.stack);
  } finally {
    process.exit(0);
  }
}

generateSummary();
