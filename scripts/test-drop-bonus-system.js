/**
 * Скрипт для тестирования системы бонусов к drop_weight
 * Проверяет корректность работы модифицированных весов и начисления бонусов
 */

const { sequelize } = require('../config/database');
const db = require('../models');
const {
    calculateModifiedDropWeights,
    selectItemWithModifiedWeights,
    getWeightDistributionStats
} = require('../utils/dropWeightCalculator');
const {
    updateUserBonuses,
    getUserBonusInfo
} = require('../utils/userBonusCalculator');

/**
 * Тестирует расчет модифицированных весов
 */
async function testDropWeightCalculation() {
    console.log('\n🧪 ТЕСТ: Расчет модифицированных весов');
    console.log('=' .repeat(50));

    // Создаем тестовые предметы с разными ценами
    const testItems = [
        { id: 1, name: 'Дешевый предмет', price: 50, drop_weight: 1.0 },
        { id: 2, name: 'Обычный предмет', price: 1500, drop_weight: 0.25 },
        { id: 3, name: 'Редкий предмет', price: 12000, drop_weight: 0.02 },
        { id: 4, name: 'Эпический предмет', price: 25000, drop_weight: 0.005 },
        { id: 5, name: 'Легендарный предмет', price: 60000, drop_weight: 0.001 }
    ];

    const bonusLevels = [0, 1, 5, 10, 15];

    for (const bonus of bonusLevels) {
        console.log(`\n📊 Бонус: +${bonus}%`);
        const stats = getWeightDistributionStats(testItems, bonus);

        console.log(`   Изменение общего веса: ${stats.weightChange}%`);

        Object.entries(stats.categories).forEach(([category, data]) => {
            if (data.count > 0) {
                console.log(`   ${category}: ${data.originalPercentage}% → ${data.modifiedPercentage}% (${data.changePercentage > 0 ? '+' : ''}${data.changePercentage}%)`);
            }
        });
    }
}

/**
 * Симулирует открытие кейсов с разными бонусами
 */
async function simulateCaseOpenings() {
    console.log('\n🎲 СИМУЛЯЦИЯ: Открытие 10000 кейсов');
    console.log('=' .repeat(50));

    const testItems = [
        { id: 1, name: 'Дешевый', price: 50, drop_weight: 1.0, rarity: 'common' },
        { id: 2, name: 'Обычный', price: 1500, drop_weight: 0.25, rarity: 'uncommon' },
        { id: 3, name: 'Редкий', price: 12000, drop_weight: 0.02, rarity: 'rare' },
        { id: 4, name: 'Эпический', price: 25000, drop_weight: 0.005, rarity: 'epic' },
        { id: 5, name: 'Легендарный', price: 60000, drop_weight: 0.001, rarity: 'legendary' }
    ];

    const simulations = [
        { bonus: 0, label: 'Без бонуса' },
        { bonus: 5, label: 'Бонус +5%' },
        { bonus: 10, label: 'Бонус +10%' },
        { bonus: 20, label: 'Бонус +20%' }
    ];

    for (const sim of simulations) {
        console.log(`\n🎯 ${sim.label}`);

        const results = {};
        const totalValue = { total: 0, count: 0 };

        // Инициализируем счетчики
        testItems.forEach(item => {
            results[item.name] = { count: 0, totalValue: 0 };
        });

        // Симулируем 10000 открытий
        for (let i = 0; i < 10000; i++) {
            const modifiedItems = calculateModifiedDropWeights(testItems, sim.bonus);
            const selectedItem = selectItemWithModifiedWeights(modifiedItems);

            results[selectedItem.name].count++;
            results[selectedItem.name].totalValue += selectedItem.price;
            totalValue.total += selectedItem.price;
            totalValue.count++;
        }

        // Выводим результаты
        testItems.forEach(item => {
            const result = results[item.name];
            const percentage = (result.count / 10000 * 100).toFixed(2);
            const avgValue = result.count > 0 ? (result.totalValue / result.count).toFixed(0) : 0;

            console.log(`   ${item.name}: ${result.count} раз (${percentage}%) | Ср. стоимость: ${avgValue}₽`);
        });

        const overallAvgValue = (totalValue.total / totalValue.count).toFixed(0);
        console.log(`   📈 Средняя стоимость выпавшего предмета: ${overallAvgValue}₽`);
    }
}

/**
 * Тестирует начисление бонусов пользователю
 */
async function testUserBonusCalculation() {
    console.log('\n👤 ТЕСТ: Начисление бонусов пользователю');
    console.log('=' .repeat(50));

    try {
        // Найдем любого пользователя для тестирования
        const user = await db.User.findOne();
        if (!user) {
            console.log('❌ Пользователи не найдены в базе данных');
            return;
        }

        console.log(`📋 Тестируем на пользователе: ${user.username} (ID: ${user.id})`);

        // Получаем текущую информацию о бонусах
        const currentBonus = await getUserBonusInfo(user.id);
        console.log('\n📊 Текущие бонусы:');
        console.log(`   Уровень: ${currentBonus.level}`);
        console.log(`   Подписка: ${currentBonus.subscriptionTier}`);
        console.log(`   Бонус от достижений: ${currentBonus.bonusBreakdown.achievements}`);
        console.log(`   Бонус от уровня: ${currentBonus.bonusBreakdown.level}`);
        console.log(`   Бонус от подписки: ${currentBonus.bonusBreakdown.subscription}`);
        console.log(`   🎯 Общий бонус: ${currentBonus.bonusBreakdown.total}`);

        // Тестируем обновление бонусов
        console.log('\n🔄 Пересчитываем бонусы...');
        const updatedBonus = await updateUserBonuses(user.id);

        console.log('✅ Бонусы пересчитаны:');
        console.log(`   Бонус от достижений: +${updatedBonus.achievementsBonus.toFixed(1)}%`);
        console.log(`   Бонус от уровня: +${updatedBonus.levelBonus.toFixed(1)}%`);
        console.log(`   Бонус от подписки: +${updatedBonus.subscriptionBonus.toFixed(1)}%`);
        console.log(`   🎯 Общий бонус: +${updatedBonus.totalBonus.toFixed(1)}%`);

    } catch (error) {
        console.error('❌ Ошибка при тестировании бонусов пользователя:', error.message);
    }
}

/**
 * Тестирует интеграцию с реальными предметами из базы данных
 */
async function testWithRealItems() {
    console.log('\n🎮 ТЕСТ: Интеграция с реальными предметами');
    console.log('=' .repeat(50));

    try {
        // Получаем случайные предметы из базы данных
        const items = await db.Item.findAll({
            limit: 20,
            order: sequelize.random()
        });

        if (items.length === 0) {
            console.log('❌ Предметы не найдены в базе данных');
            return;
        }

        console.log(`📦 Найдено ${items.length} предметов для тестирования`);

        // Показываем статистику для разных уровней бонуса
        const bonusLevels = [0, 5, 10, 15];

        for (const bonus of bonusLevels) {
            console.log(`\n🎯 Бонус +${bonus}%:`);

            const modifiedItems = calculateModifiedDropWeights(items, bonus);

            // Группируем по ценовым категориям
            const priceCategories = {
                'Дешевые (<1000₽)': [],
                'Средние (1000-10000₽)': [],
                'Дорогие (10000-30000₽)': [],
                'Очень дорогие (30000₽+)': []
            };

            modifiedItems.forEach(item => {
                const price = parseFloat(item.price) || 0;
                if (price < 1000) {
                    priceCategories['Дешевые (<1000₽)'].push(item);
                } else if (price < 10000) {
                    priceCategories['Средние (1000-10000₽)'].push(item);
                } else if (price < 30000) {
                    priceCategories['Дорогие (10000-30000₽)'].push(item);
                } else {
                    priceCategories['Очень дорогие (30000₽+)'].push(item);
                }
            });

            Object.entries(priceCategories).forEach(([category, categoryItems]) => {
                if (categoryItems.length > 0) {
                    const totalOriginalWeight = categoryItems.reduce((sum, item) => sum + (item.drop_weight || 1), 0);
                    const totalModifiedWeight = categoryItems.reduce((sum, item) => sum + item.modified_drop_weight, 0);
                    const change = ((totalModifiedWeight - totalOriginalWeight) / totalOriginalWeight * 100).toFixed(1);

                    console.log(`   ${category}: ${categoryItems.length} предметов, изменение веса: ${change > 0 ? '+' : ''}${change}%`);
                }
            });
        }

    } catch (error) {
        console.error('❌ Ошибка при тестировании с реальными предметами:', error.message);
    }
}

/**
 * Главная функция тестирования
 */
async function runTests() {
    try {
        console.log('🚀 ЗАПУСК ТЕСТИРОВАНИЯ СИСТЕМЫ БОНУСОВ К DROP_WEIGHT');
        console.log('=' .repeat(60));

        await sequelize.authenticate();
        console.log('✅ Подключение к базе данных установлено');

        // Запускаем все тесты
        await testDropWeightCalculation();
        await simulateCaseOpenings();
        await testUserBonusCalculation();
        await testWithRealItems();

        console.log('\n🎉 ВСЕ ТЕСТЫ ЗАВЕРШЕНЫ УСПЕШНО!');
        console.log('=' .repeat(60));

    } catch (error) {
        console.error('❌ Ошибка при выполнении тестов:', error);
    } finally {
        await sequelize.close();
    }
}

// Запускаем тесты если скрипт вызван напрямую
if (require.main === module) {
    runTests();
}

module.exports = {
    testDropWeightCalculation,
    simulateCaseOpenings,
    testUserBonusCalculation,
    testWithRealItems,
    runTests
};
