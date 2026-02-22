const fs = require('fs');
const path = require('path');

// Читаем предметы из файла
function loadItemsFromFile() {
  const filePath = path.join(__dirname, '../docs/YooMoneyIntegration.md');
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n').slice(2); // Пропускаем заголовок

  const items = lines
    .filter(l => l.trim() && l.includes('|'))
    .map(l => {
      const parts = l.split('|').map(p => p.trim());
      if (parts.length < 5) return null;
      
      // Цена в файле и в системе — в рублях
      const price = parseFloat(parts[3]) || 0;
      
      return {
        id: parts[0],
        name: parts[1],
        price: price,
        rarity: parts[4],
        available: parts[5] === 'Да'
      };
    })
    .filter(i => i && i.price > 0);

  return items;
}

// Платные кейсы
const PAID_CASES = [
  { id: '88888888-8888-8888-8888-888888888888', name: 'Бронзовый кейс', price: 17 },
  { id: '99999999-9999-9999-9999-999999999999', name: 'Пушистый кейс', price: 49 },
  { id: '66666666-6666-6666-6666-666666666666', name: 'Стандартный кейс', price: 99 },
  { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', name: 'Золотой кейс', price: 101 },
  { id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', name: 'Платиновый кейс', price: 250 },
  { id: 'cccccccc-cccc-cccc-cccc-cccccccccccc', name: 'Алмазный кейс', price: 601 },
  { id: 'dddddddd-dddd-dddd-dddd-dddddddddddd', name: 'Легендарный кейс', price: 998 },
  { id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', name: 'Мистический кейс', price: 2499 },
  { id: 'ffffffff-ffff-ffff-ffff-ffffffffffff', name: 'Эпический кейс', price: 5000 },
  { id: '10101010-1010-1010-1010-101010101010', name: 'Мифический кейс', price: 10000 },
];

function analyzeItems() {
  const items = loadItemsFromFile();
  
  console.log('='.repeat(100));
  console.log('📊 АНАЛИЗ ПРЕДМЕТОВ И СТРАТЕГИЯ РАСПРЕДЕЛЕНИЯ');
  console.log('='.repeat(100));
  console.log(`\nВсего предметов в файле: ${items.length}`);
  
  // Анализ по ценовым категориям (цены в рублях)
  const priceCategories = {
    'Очень дешевые (<20₽)': items.filter(i => i.price < 20),
    'Дешевые (20-50₽)': items.filter(i => i.price >= 20 && i.price < 50),
    'Средние (50-200₽)': items.filter(i => i.price >= 50 && i.price < 200),
    'Дорогие (200-600₽)': items.filter(i => i.price >= 200 && i.price < 600),
    'Очень дорогие (600-2000₽)': items.filter(i => i.price >= 600 && i.price < 2000),
    'Ультра дорогие (2000-10000₽)': items.filter(i => i.price >= 2000 && i.price < 10000),
    'Экстремально дорогие (10000+₽)': items.filter(i => i.price >= 10000),
  };
  
  console.log('\n📋 Распределение предметов по ценам:');
  Object.entries(priceCategories).forEach(([category, itemsInCategory]) => {
    console.log(`   ${category}: ${itemsInCategory.length} предметов`);
  });
  
  // Стратегия распределения
  console.log('\n' + '='.repeat(100));
  console.log('🎯 СТРАТЕГИЯ РАСПРЕДЕЛЕНИЯ ПО КЕЙСАМ');
  console.log('='.repeat(100));
  
  console.log('\n📦 ПЛАТНЫЕ КЕЙСЫ (от дешевых к дорогим):\n');
  
  PAID_CASES.forEach((caseInfo, index) => {
    console.log(`${index + 1}. ${caseInfo.name} (${caseInfo.price}₽)`);
  });
  
  console.log('\n💡 ПРИНЦИПЫ РАСПРЕДЕЛЕНИЯ:');
  console.log('   1. Каждый кейс содержит широкий диапазон цен (от дешевых до дорогих)');
  console.log('   2. Минимум пересечений между кейсами (уникальность)');
  console.log('   3. Количество предметов варьируется: 10-30 в зависимости от цены кейса');
  console.log('   4. Дешевые кейсы (17-101₽): больше дешевых предметов, но есть и дорогие');
  console.log('   5. Дорогие кейсы (250-10000₽): больше дорогих предметов, но есть и дешевые');
  
  console.log('\n📊 ПРЕДВАРИТЕЛЬНОЕ РАСПРЕДЕЛЕНИЕ:\n');
  
  // Примерное распределение
  const distribution = [
    { case: 'Бронзовый (17₽)', items: 20, ranges: '5-25₽ (40%), 25-60₽ (35%), 60-150₽ (20%), 150-500₽ (5%)' },
    { case: 'Пушистый (49₽)', items: 25, ranges: '10-50₽ (35%), 50-150₽ (40%), 150-400₽ (20%), 400-1000₽ (5%)' },
    { case: 'Стандартный (99₽)', items: 30, ranges: '20-100₽ (30%), 100-300₽ (35%), 300-800₽ (25%), 800-2000₽ (10%)' },
    { case: 'Золотой (101₽)', items: 25, ranges: '20-100₽ (30%), 100-300₽ (35%), 300-800₽ (25%), 800-2000₽ (10%)' },
    { case: 'Платиновый (250₽)', items: 30, ranges: '50-250₽ (25%), 250-600₽ (30%), 600-1500₽ (30%), 1500-5000₽ (15%)' },
    { case: 'Алмазный (601₽)', items: 25, ranges: '100-600₽ (20%), 600-1500₽ (30%), 1500-4000₽ (30%), 4000-10000₽ (20%)' },
    { case: 'Легендарный (998₽)', items: 30, ranges: '200-1000₽ (20%), 1000-3000₽ (30%), 3000-8000₽ (30%), 8000-20000₽ (20%)' },
    { case: 'Мистический (2499₽)', items: 20, ranges: '500-2500₽ (15%), 2500-6000₽ (30%), 6000-15000₽ (35%), 15000+₽ (20%)' },
    { case: 'Эпический (5000₽)', items: 25, ranges: '1000-5000₽ (15%), 5000-12000₽ (30%), 12000-30000₽ (35%), 30000+₽ (20%)' },
    { case: 'Мифический (10000₽)', items: 30, ranges: '2000-10000₽ (10%), 10000-25000₽ (30%), 25000-60000₽ (40%), 60000+₽ (20%)' },
  ];
  
  distribution.forEach((dist, index) => {
    console.log(`${index + 1}. ${dist.case}: ${dist.items} предметов`);
    console.log(`   Диапазоны: ${dist.ranges}`);
  });
  
  console.log('\n' + '='.repeat(100));
  console.log('✅ Анализ завершен!');
  console.log('='.repeat(100));
}

analyzeItems();
