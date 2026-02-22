const fs = require('fs');
const path = require('path');

// Читаем файл с предметами
const filePath = path.join(__dirname, '../docs/YooMoneyIntegration.md');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n').slice(2); // Пропускаем заголовок

// Парсим предметы
const items = lines
  .filter(l => l.trim() && l.includes('|'))
  .map(l => {
    const parts = l.split('|').map(p => p.trim());
    if (parts.length < 5) return null;
    
    // Цена в файле — в рублях
    const priceStr = parts[3];
    const price = parseFloat(priceStr) || 0;
    
    return {
      id: parts[0],
      name: parts[1],
      price: price,
      rarity: parts[4],
      inStock: parts[5] === 'Да'
    };
  })
  .filter(i => i && i.price > 0);

console.log(`Всего предметов в файле: ${items.length}\n`);

// Группируем по ценовым категориям
const byPrice = {
  veryCheap: items.filter(i => i.price < 20),      // <20₽
  cheap: items.filter(i => i.price >= 20 && i.price < 50),  // 20-50₽
  medium: items.filter(i => i.price >= 50 && i.price < 200), // 50-200₽
  expensive: items.filter(i => i.price >= 200 && i.price < 600), // 200-600₽
  veryExpensive: items.filter(i => i.price >= 600 && i.price < 2000), // 600-2000₽
  ultraExpensive: items.filter(i => i.price >= 2000 && i.price < 10000), // 2000-10000₽
  extreme: items.filter(i => i.price >= 10000) // 10000+₽
};

console.log('Распределение предметов по ценам:');
console.log(`Очень дешевые (<20₽): ${byPrice.veryCheap.length}`);
console.log(`Дешевые (20-50₽): ${byPrice.cheap.length}`);
console.log(`Средние (50-200₽): ${byPrice.medium.length}`);
console.log(`Дорогие (200-600₽): ${byPrice.expensive.length}`);
console.log(`Очень дорогие (600-2000₽): ${byPrice.veryExpensive.length}`);
console.log(`Ультра дорогие (2000-10000₽): ${byPrice.ultraExpensive.length}`);
console.log(`Экстремально дорогие (10000+₽): ${byPrice.extreme.length}\n`);

// Показываем примеры из каждой категории
console.log('Примеры предметов по категориям:\n');
Object.entries(byPrice).forEach(([category, categoryItems]) => {
  if (categoryItems.length > 0) {
    console.log(`${category.toUpperCase()}:`);
    categoryItems.slice(0, 5).forEach(item => {
      console.log(`  - ${item.name.substring(0, 50).padEnd(50)} | ${item.price.toFixed(2)}₽ | ${item.rarity}`);
    });
    if (categoryItems.length > 5) {
      console.log(`  ... и еще ${categoryItems.length - 5} предметов`);
    }
    console.log('');
  }
});

process.exit(0);
