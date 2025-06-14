const { sequelize, Item, CaseTemplate } = require('../models');
const { Op } = require('sequelize');

// ===============================
// КОНФИГУРАЦИЯ - ИЗМЕНИТЕ ЗДЕСЬ
// ===============================

const CONFIG = {
  // ID шаблона кейса (найти можно в базе данных в таблице case_templates)
  caseTemplateId: '5a476068-a566-41db-bbc5-e95b0137b649', // Покупной кейс

  // Категория предметов из linkItems-complete.js
  // Доступные: consumer, industrial, milspec, restricted, classified, covert, contraband, exotic
  category: 'consumer',

  // Количество предметов для добавления
  itemCount: 20,

  // Режим добавления:
  // 'add' - добавить к существующим предметам
  // 'replace' - заменить все предметы в кейсе
  mode: 'add'
};

// ===============================

// Маппинг категорий на редкости в базе данных
const CATEGORY_TO_RARITY_MAP = {
  'consumer': 'consumer',
  'industrial': 'industrial',
  'milspec': 'milspec',
  'restricted': 'restricted',
  'classified': 'classified',
  'covert': 'covert',
  'contraband': 'contraband',
  'exotic': 'exotic'
};

// Ценовые диапазоны для каждой категории (для фильтрации)
const CATEGORY_PRICE_RANGES = {
  'consumer': { min: 0, max: 50 },
  'industrial': { min: 10, max: 200 },
  'milspec': { min: 50, max: 1000 },
  'restricted': { min: 200, max: 5000 },
  'classified': { min: 1000, max: 15000 },
  'covert': { min: 5000, max: 50000 },
  'contraband': { min: 10000, max: 150000 },
  'exotic': { min: 50000, max: 500000 }
};

async function updateCaseItemPool() {
  try {
    console.log('🎯 ОБНОВЛЕНИЕ ПУЛА ПРЕДМЕТОВ В КЕЙСЕ');
    console.log(`📦 Кейс ID: ${CONFIG.caseTemplateId}`);
    console.log(`📋 Категория: ${CONFIG.category}`);
    console.log(`🔢 Количество: ${CONFIG.itemCount}`);
    console.log(`⚙️  Режим: ${CONFIG.mode}\n`);

    // Находим шаблон кейса
    const caseTemplate = await CaseTemplate.findOne({
      where: { id: CONFIG.caseTemplateId },
      include: [{
        model: Item,
        as: 'items',
        through: { attributes: [] }
      }]
    });

    if (!caseTemplate) {
      console.error('❌ Кейс не найден с ID:', CONFIG.caseTemplateId);
      return;
    }

    console.log(`📦 Найден кейс: "${caseTemplate.name}"`);
    console.log(`📋 Текущее количество предметов: ${caseTemplate.items.length}`);

    // Получаем редкость и ценовой диапазон для категории
    const targetRarity = CATEGORY_TO_RARITY_MAP[CONFIG.category];
    const priceRange = CATEGORY_PRICE_RANGES[CONFIG.category];

    if (!targetRarity) {
      console.error('❌ Неизвестная категория:', CONFIG.category);
      console.log('✅ Доступные категории:', Object.keys(CATEGORY_TO_RARITY_MAP).join(', '));
      return;
    }

    // Ищем предметы нужной категории
    const whereClause = {
      is_available: true,
      rarity: targetRarity
    };

    // Добавляем фильтр по цене если нужно
    if (priceRange) {
      whereClause.price = {
        [Op.between]: [priceRange.min, priceRange.max]
      };
    }

    const availableItems = await Item.findAll({
      where: whereClause,
      attributes: ['id', 'name', 'rarity', 'price'],
      order: [['price', 'ASC']]
    });

    if (availableItems.length === 0) {
      console.error(`❌ Не найдено предметов категории "${CONFIG.category}"`);
      return;
    }

    console.log(`📋 Найдено доступных предметов: ${availableItems.length}`);

    // Показываем статистику найденных предметов
    const avgPrice = availableItems.reduce((sum, item) => sum + parseFloat(item.price), 0) / availableItems.length;
    const minPrice = Math.min(...availableItems.map(item => parseFloat(item.price)));
    const maxPrice = Math.max(...availableItems.map(item => parseFloat(item.price)));

    console.log(`💰 Ценовой диапазон: ₽${minPrice.toFixed(2)} - ₽${maxPrice.toFixed(2)} (средняя: ₽${avgPrice.toFixed(2)})`);

    // Выбираем случайные предметы
    const selectedItems = getRandomItems(availableItems, CONFIG.itemCount);

    if (selectedItems.length === 0) {
      console.error('❌ Не удалось выбрать предметы');
      return;
    }

    console.log(`✅ Выбрано предметов для добавления: ${selectedItems.length}`);

    // Применяем изменения в зависимости от режима
    let finalItemsList = [];

    if (CONFIG.mode === 'replace') {
      // Заменяем все предметы
      finalItemsList = selectedItems;
      await caseTemplate.setItems(selectedItems);
      console.log(`🔄 Заменены все предметы в кейсе`);
    } else {
      // Добавляем к существующим
      await caseTemplate.addItems(selectedItems);

      // Получаем обновленный список для статистики
      const updatedCase = await CaseTemplate.findOne({
        where: { id: CONFIG.caseTemplateId },
        include: [{
          model: Item,
          as: 'items',
          through: { attributes: [] }
        }]
      });
      finalItemsList = updatedCase.items;
      console.log(`➕ Добавлены предметы к существующим`);
    }

    // Показываем финальную статистику
    console.log(`\n📊 ФИНАЛЬНАЯ СТАТИСТИКА:`);
    console.log(`📦 Общее количество предметов в кейсе: ${finalItemsList.length}`);

    if (finalItemsList.length > 0) {
      const finalAvgPrice = finalItemsList.reduce((sum, item) => sum + parseFloat(item.price), 0) / finalItemsList.length;
      console.log(`💰 Средняя стоимость предметов: ₽${finalAvgPrice.toFixed(2)}`);

      // Показываем распределение по редкости
      const rarityDistribution = {};
      finalItemsList.forEach(item => {
        rarityDistribution[item.rarity] = (rarityDistribution[item.rarity] || 0) + 1;
      });

      console.log(`📋 Распределение по редкости:`);
      Object.entries(rarityDistribution).forEach(([rarity, count]) => {
        const percentage = (count / finalItemsList.length * 100).toFixed(1);
        console.log(`   ${rarity}: ${count} предметов (${percentage}%)`);
      });
    }

    console.log(`\n✅ Обновление завершено успешно!`);

  } catch (error) {
    console.error('❌ Ошибка при обновлении пула предметов:', error);
  } finally {
    await sequelize.close();
  }
}

function getRandomItems(items, count) {
  if (items.length === 0 || count <= 0) return [];

  // Перемешиваем массив и берем нужное количество
  const shuffled = [...items].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(count, items.length));
}

// Запуск скрипта
updateCaseItemPool();
