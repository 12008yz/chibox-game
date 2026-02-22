const { Sequelize } = require('sequelize');
const { CaseTemplate, Item, CaseTemplateItem } = require('../models');
const { calculateCorrectWeightByPrice, determineCaseType } = require('../utils/dropWeightCalculator');

// Все кейсы из сидеров
const ALL_CASES = [
  // Ежедневные кейсы
  { id: '11111111-1111-1111-1111-111111111111', name: 'Ежедневный кейс - Бесплатный', type: 'daily', price: 0 },
  { id: '22222222-2222-2222-2222-222222222222', name: 'Ежедневный кейс - Статус', type: 'daily', price: 0 },
  { id: '33333333-3333-3333-3333-333333333333', name: 'Ежедневный кейс - Статус+', type: 'daily', price: 0 },
  { id: '44444444-4444-4444-4444-444444444444', name: 'Ежедневный кейс - Статус++', type: 'daily', price: 0 },
  { id: '55555555-5555-5555-5555-555555555555', name: 'Бонусный кейс', type: 'special', price: 0 },
  
  // Платные кейсы
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

async function analyzeAllCases() {
  try {
    console.log('='.repeat(100));
    console.log('📊 ПОЛНЫЙ АНАЛИЗ ВСЕХ КЕЙСОВ ИЗ СИДЕРОВ');
    console.log('='.repeat(100));
    console.log('');

    const results = [];

    for (const caseInfo of ALL_CASES) {
      console.log('━'.repeat(100));
      console.log(`🎁 ${caseInfo.name.toUpperCase()}`);
      console.log('━'.repeat(100));
      console.log(`💰 Цена: ${caseInfo.price}₽`);
      console.log(`🆔 ID: ${caseInfo.id}`);
      console.log(`📦 Тип: ${caseInfo.type}`);
      console.log('');

      // Получаем кейс из БД
      const caseTemplate = await CaseTemplate.findByPk(caseInfo.id);

      if (!caseTemplate) {
        console.log('⚠️  Кейс не найден в базе данных!\n');
        results.push({
          ...caseInfo,
          found: false,
          itemsCount: 0,
          error: 'Кейс не найден в БД'
        });
        continue;
      }

      if (!caseTemplate.is_active) {
        console.log('⚠️  Кейс неактивен!\n');
      }

      // Получаем все связи предметов с кейсом
      const caseTemplateItems = await CaseTemplateItem.findAll({
        where: { case_template_id: caseInfo.id },
        attributes: ['case_template_id', 'item_id'],
        raw: true
      });

      if (!caseTemplateItems || caseTemplateItems.length === 0) {
        console.log('⚠️  Предметы не найдены!\n');
        results.push({
          ...caseInfo,
          found: true,
          active: caseTemplate.is_active,
          itemsCount: 0,
          error: 'Нет предметов в кейсе'
        });
        continue;
      }

      // Получаем ID всех предметов
      const itemIds = caseTemplateItems.map(cti => cti.item_id);

      // Получаем сами предметы
      const caseItems = await Item.findAll({
        where: {
          id: itemIds
        }
      });

      console.log(`📋 Всего предметов в кейсе: ${caseItems.length}\n`);

      // Определяем тип кейса для правильного расчета весов
      const caseType = determineCaseType(caseTemplate, caseInfo.price > 0);
      console.log(`🔧 Тип кейса для расчета весов: ${caseType}`);

      // Подготавливаем данные предметов
      const items = caseItems.map(item => ({
        id: item.id,
        name: item.name,
        price: parseFloat(item.price) || 0,
        rarity: item.rarity
      }));

      // Рассчитываем веса для каждого предмета
      const itemsWithWeights = items.map(item => {
        const weight = calculateCorrectWeightByPrice(item.price, caseType);
        const ratio = caseInfo.price > 0 ? (item.price / caseInfo.price) : 0;
        return {
          ...item,
          weight,
          ratio: ratio.toFixed(2),
          chance: 0 // Будет рассчитано ниже
        };
      });

      // Общий вес
      const totalWeight = itemsWithWeights.reduce((sum, item) => sum + item.weight, 0);

      if (totalWeight === 0) {
        console.log('⚠️  Общий вес равен 0! Невозможно рассчитать вероятности.\n');
        results.push({
          ...caseInfo,
          found: true,
          active: caseTemplate.is_active,
          itemsCount: items.length,
          error: 'Общий вес равен 0'
        });
        continue;
      }

      // Рассчитываем вероятности для каждого предмета
      itemsWithWeights.forEach(item => {
        item.chance = (item.weight / totalWeight) * 100;
      });

      // Средняя стоимость выигрыша (только для платных кейсов)
      let avgWin = 0;
      let rtp = 0;
      if (caseInfo.price > 0) {
        avgWin = itemsWithWeights.reduce((sum, item) => {
          return sum + (item.price * (item.chance / 100));
        }, 0);
        rtp = ((avgWin / caseInfo.price) * 100).toFixed(2);
        console.log(`📊 СТАТИСТИКА:`);
        console.log(`   Средний выигрыш: ${avgWin.toFixed(2)}₽`);
        console.log(`   RTP: ${rtp}%`);
        console.log('');
      }

      // Сортируем по вероятности (от самых редких к самым частым)
      itemsWithWeights.sort((a, b) => b.chance - a.chance);

      // Группируем по вероятностям
      const probabilityGroups = {
        'Очень редкие (<0.1%)': itemsWithWeights.filter(i => i.chance < 0.1),
        'Редкие (0.1-1%)': itemsWithWeights.filter(i => i.chance >= 0.1 && i.chance < 1),
        'Нечастые (1-5%)': itemsWithWeights.filter(i => i.chance >= 1 && i.chance < 5),
        'Средние (5-10%)': itemsWithWeights.filter(i => i.chance >= 10 && i.chance < 10),
        'Частые (10-20%)': itemsWithWeights.filter(i => i.chance >= 10 && i.chance < 20),
        'Очень частые (>20%)': itemsWithWeights.filter(i => i.chance >= 20)
      };

      console.log(`📈 РАСПРЕДЕЛЕНИЕ ВЕРОЯТНОСТЕЙ:`);
      for (const [groupName, groupItems] of Object.entries(probabilityGroups)) {
        if (groupItems.length === 0) continue;
        const groupTotalChance = groupItems.reduce((sum, item) => sum + item.chance, 0);
        console.log(`   ${groupName}: ${groupItems.length} предметов (${groupTotalChance.toFixed(2)}% общий шанс)`);
      }
      console.log('');

      // Показываем топ-10 самых редких предметов
      console.log(`🏆 ТОП-10 САМЫХ РЕДКИХ ПРЕДМЕТОВ:`);
      console.log('─'.repeat(100));
      itemsWithWeights.slice(0, 10).forEach((item, index) => {
        const chanceStr = item.chance < 0.01 
          ? item.chance.toFixed(6) + '%'
          : item.chance.toFixed(4) + '%';
        const ratioStr = caseInfo.price > 0 ? `x${item.ratio}` : 'N/A';
        console.log(`${(index + 1).toString().padStart(2)}. ${item.name.substring(0, 50).padEnd(50)} | ${item.price.toFixed(2).padStart(10)}₽ | ${ratioStr.padStart(8)} | ${chanceStr.padStart(10)}`);
      });
      console.log('');

      // Показываем топ-10 самых частых предметов
      console.log(`📊 ТОП-10 САМЫХ ЧАСТЫХ ПРЕДМЕТОВ:`);
      console.log('─'.repeat(100));
      itemsWithWeights.slice(-10).reverse().forEach((item, index) => {
        const chanceStr = item.chance < 0.01 
          ? item.chance.toFixed(6) + '%'
          : item.chance.toFixed(4) + '%';
        const ratioStr = caseInfo.price > 0 ? `x${item.ratio}` : 'N/A';
        console.log(`${(index + 1).toString().padStart(2)}. ${item.name.substring(0, 50).padEnd(50)} | ${item.price.toFixed(2).padStart(10)}₽ | ${ratioStr.padStart(8)} | ${chanceStr.padStart(10)}`);
      });
      console.log('');

      results.push({
        ...caseInfo,
        found: true,
        active: caseTemplate.is_active,
        itemsCount: items.length,
        caseType: caseType,
        totalWeight: totalWeight,
        avgWin: caseInfo.price > 0 ? avgWin : null,
        rtp: caseInfo.price > 0 ? parseFloat(rtp) : null,
        probabilityGroups: probabilityGroups
      });
    }

    // Итоговая сводка
    console.log('\n');
    console.log('='.repeat(100));
    console.log('📋 ИТОГОВАЯ СВОДКА');
    console.log('='.repeat(100));
    console.log('');
    console.log('Кейс'.padEnd(50) + ' | Цена'.padStart(8) + ' | Предметов'.padStart(12) + ' | RTP'.padStart(8) + ' | Статус');
    console.log('─'.repeat(100));

    results.forEach(result => {
      const name = result.name.substring(0, 48).padEnd(50);
      const price = result.price > 0 ? `${result.price}₽`.padStart(8) : 'Беспл.'.padStart(8);
      const itemsCount = result.itemsCount.toString().padStart(12);
      const rtp = result.rtp !== null ? `${result.rtp}%`.padStart(8) : 'N/A'.padStart(8);
      const status = result.found 
        ? (result.active ? '✅ Активен' : '⚠️  Неактивен')
        : '❌ Не найден';
      
      console.log(`${name} | ${price} | ${itemsCount} | ${rtp} | ${status}`);
    });

    console.log('\n');
    console.log('='.repeat(100));
    console.log('✅ Анализ завершен!');
    console.log('='.repeat(100));

  } catch (error) {
    console.error('❌ Ошибка при анализе:', error);
    console.error(error.stack);
  } finally {
    process.exit(0);
  }
}

// Запускаем анализ
analyzeAllCases();
