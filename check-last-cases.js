const db = require('./models');

async function checkLastOpenedCases() {
  try {
    console.log('='.repeat(80));
    console.log('ПРОВЕРКА ПОСЛЕДНИХ ОТКРЫТЫХ КЕЙСОВ "ДЕМОНИЧЕСКИЙ КЕЙС" (10,000₽)');
    console.log('='.repeat(80));
    console.log('');

    // ID Демонического кейса
    const mythicCaseId = '10101010-1010-1010-1010-101010101010';

    // Получаем последние 20 открытых кейсов
    const openedCases = await db.Case.findAll({
      where: {
        template_id: mythicCaseId,
        is_opened: true
      },
      include: [
        {
          model: db.Item,
          as: 'result_item',
          attributes: ['id', 'name', 'price', 'rarity']
        },
        {
          model: db.User,
          as: 'user',
          attributes: ['id', 'username', 'email']
        }
      ],
      order: [['opened_date', 'DESC']],
      limit: 20
    });

    if (openedCases.length === 0) {
      console.log('❌ Не найдено открытых Демонических кейсов!');
      console.log('');
      console.log('Проверяем все открытые кейсы за последнее время...');

      const allRecentCases = await db.Case.findAll({
        where: {
          is_opened: true
        },
        include: [
          {
            model: db.Item,
            as: 'result_item',
            attributes: ['id', 'name', 'price', 'rarity']
          },
          {
            model: db.CaseTemplate,
            as: 'template',
            attributes: ['id', 'name', 'price']
          },
          {
            model: db.User,
            as: 'user',
            attributes: ['id', 'username', 'email']
          }
        ],
        order: [['opened_date', 'DESC']],
        limit: 20
      });

      console.log(`\n📦 Последние 20 открытых кейсов (любые типы):\n`);
      allRecentCases.forEach((c, index) => {
        const item = c.result_item;
        const template = c.template;
        console.log(`${index + 1}. Кейс: ${template?.name || 'N/A'} (${template?.price || 0}₽)`);
        console.log(`   Пользователь: ${c.user?.username || c.user?.email || c.user_id}`);
        console.log(`   Открыт: ${c.opened_date}`);
        console.log(`   Выигрыш: ${item?.name || 'N/A'} — ${item?.price || 0}₽ (${item?.rarity || 'N/A'})`);
        console.log('');
      });
    } else {
      console.log(`📦 Найдено открытых Демонических кейсов: ${openedCases.length}\n`);

      // Статистика
      const prices = openedCases.map(c => parseFloat(c.result_item?.price || 0));
      const totalWon = prices.reduce((sum, p) => sum + p, 0);
      const avgWon = totalWon / prices.length;
      const minWon = Math.min(...prices);
      const maxWon = Math.max(...prices);

      console.log('📊 СТАТИСТИКА:');
      console.log(`   Всего выиграно: ${totalWon.toFixed(2)}₽`);
      console.log(`   Средний выигрыш: ${avgWon.toFixed(2)}₽`);
      console.log(`   Минимум: ${minWon.toFixed(2)}₽`);
      console.log(`   Максимум: ${maxWon.toFixed(2)}₽`);
      console.log(`   RTP: ${((avgWon / 10000) * 100).toFixed(2)}%`);
      console.log('');

      // Распределение по ценам
      const distribution = {
        'МЕГА ДЖЕКПОТ (>30k)': prices.filter(p => p >= 30000).length,
        'БОЛЬШОЙ ДЖЕКПОТ (20k-30k)': prices.filter(p => p >= 20000 && p < 30000).length,
        'ДЖЕКПОТ (15k-20k)': prices.filter(p => p >= 15000 && p < 20000).length,
        'ХОРОШИЙ ВЫИГРЫШ (10k-15k)': prices.filter(p => p >= 10000 && p < 15000).length,
        'ОКУП (8k-10k)': prices.filter(p => p >= 8000 && p < 10000).length,
        'СРЕДНИЙ ПРОИГРЫШ (5k-8k)': prices.filter(p => p >= 5000 && p < 8000).length,
        'БОЛЬШОЙ ПРОИГРЫШ (3k-5k)': prices.filter(p => p >= 3000 && p < 5000).length,
        'КАТАСТРОФА (1k-3k)': prices.filter(p => p >= 1000 && p < 3000).length,
        'МУСОР (<1k)': prices.filter(p => p < 1000).length
      };

      console.log('📈 РАСПРЕДЕЛЕНИЕ ПО ЦЕНАМ:');
      Object.entries(distribution).forEach(([category, count]) => {
        if (count > 0) {
          const percentage = ((count / openedCases.length) * 100).toFixed(1);
          console.log(`   ${category}: ${count} шт. (${percentage}%)`);
        }
      });
      console.log('');

      console.log('📋 ДЕТАЛЬНЫЙ СПИСОК:\n');
      openedCases.forEach((c, index) => {
        const item = c.result_item;
        const price = parseFloat(item?.price || 0);
        const ratio = (price / 10000).toFixed(2);
        const user = c.user;

        console.log(`${index + 1}. ${item?.name || 'N/A'}`);
        console.log(`   Цена: ${price.toFixed(2)}₽ (x${ratio} от кейса)`);
        console.log(`   Редкость: ${item?.rarity || 'N/A'}`);
        console.log(`   Пользователь: ${user?.username || user?.email || c.user_id}`);
        console.log(`   Дата открытия: ${c.opened_date}`);
        console.log('');
      });
    }

    console.log('='.repeat(80));
    console.log('✅ Проверка завершена!');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('❌ Ошибка при проверке:', error);
  } finally {
    process.exit(0);
  }
}

// Запускаем проверку
checkLastOpenedCases();
