const db = require('../models');
const { logger } = require('../utils/logger');

/**
 * Скрипт для очистки записей выпавших предметов из кейсов
 * Использование:
 *
 * 1. Очистить все записи для всех пользователей и кейсов:
 *    node scripts/clear-case-drops.js --all
 *
 * 2. Очистить записи для конкретного пользователя:
 *    node scripts/clear-case-drops.js --user-id <user_id>
 *
 * 3. Очистить записи для конкретного кейса:
 *    node scripts/clear-case-drops.js --case-template-id <case_template_id>
 *
 * 4. Очистить записи для конкретного пользователя и кейса:
 *    node scripts/clear-case-drops.js --user-id <user_id> --case-template-id <case_template_id>
 *
 * 5. Показать статистику без удаления:
 *    node scripts/clear-case-drops.js --stats
 */

async function main() {
  try {
    const args = process.argv.slice(2);

    // Парсим аргументы командной строки
    const flags = {
      all: args.includes('--all'),
      stats: args.includes('--stats'),
      userId: getArgValue(args, '--user-id'),
      caseTemplateId: getArgValue(args, '--case-template-id'),
    };

    console.log('🎮 Скрипт очистки зачёркнутых предметов из кейсов');
    console.log('===============================================');

    // Показываем статистику
    await showStatistics();

    if (flags.stats) {
      console.log('\n✅ Показана только статистика (без изменений)');
      process.exit(0);
    }

    // Проверяем, что указан хотя бы один параметр для очистки
    if (!flags.all && !flags.userId && !flags.caseTemplateId) {
      console.log('\n❌ Ошибка: необходимо указать параметры для очистки');
      console.log('Используйте --help для справки');
      showHelp();
      process.exit(1);
    }

    // Подтверждение действия
    if (!await confirmAction(flags)) {
      console.log('\n❌ Операция отменена пользователем');
      process.exit(0);
    }

    // Выполняем очистку
    const deletedCount = await performCleanup(flags);

    console.log(`\n✅ Успешно удалено записей: ${deletedCount}`);

    // Показываем статистику после очистки
    console.log('\n📊 Статистика после очистки:');
    await showStatistics();

  } catch (error) {
    logger.error('Ошибка в скрипте очистки:', error);
    console.error('\n❌ Произошла ошибка:', error.message);
    process.exit(1);
  } finally {
    await db.sequelize.close();
  }
}

function getArgValue(args, flag) {
  const index = args.indexOf(flag);
  return index !== -1 && index + 1 < args.length ? args[index + 1] : null;
}

async function showStatistics() {
  try {
    // Общая статистика
    const totalDrops = await db.CaseItemDrop.count();

    // Статистика по пользователям
    const userStats = await db.CaseItemDrop.findAll({
      attributes: [
        'user_id',
        [db.sequelize.fn('COUNT', '*'), 'drop_count']
      ],
      group: ['user_id'],
      order: [[db.sequelize.literal('drop_count'), 'DESC']],
      limit: 10,
      include: [{
        model: db.User,
        as: 'user',
        attributes: ['username', 'email']
      }]
    });

    // Статистика по кейсам
    const caseStats = await db.CaseItemDrop.findAll({
      attributes: [
        'case_template_id',
        [db.sequelize.fn('COUNT', '*'), 'drop_count']
      ],
      group: ['case_template_id'],
      order: [[db.sequelize.literal('drop_count'), 'DESC']],
      limit: 10,
      include: [{
        model: db.CaseTemplate,
        as: 'case_template',
        attributes: ['name', 'type']
      }]
    });

    console.log('\n📊 Текущая статистика:');
    console.log(`   Всего записей выпавших предметов: ${totalDrops}`);

    console.log('\n👥 Топ-10 пользователей по количеству записей:');
    userStats.forEach((stat, index) => {
      const username = stat.user?.username || stat.user?.email || 'Неизвестный';
      console.log(`   ${index + 1}. ${username} (${stat.user_id.slice(0, 8)}...): ${stat.dataValues.drop_count} записей`);
    });

    console.log('\n📦 Топ-10 кейсов по количеству записей:');
    caseStats.forEach((stat, index) => {
      const caseName = stat.case_template?.name || 'Неизвестный кейс';
      console.log(`   ${index + 1}. ${caseName}: ${stat.dataValues.drop_count} записей`);
    });

  } catch (error) {
    console.error('Ошибка получения статистики:', error.message);
  }
}

async function confirmAction(flags) {
  let description = '';

  if (flags.all) {
    description = 'ВСЕ записи выпавших предметов для ВСЕХ пользователей и кейсов';
  } else if (flags.userId && flags.caseTemplateId) {
    description = `записи для пользователя ${flags.userId} и кейса ${flags.caseTemplateId}`;
  } else if (flags.userId) {
    description = `ВСЕ записи для пользователя ${flags.userId}`;
  } else if (flags.caseTemplateId) {
    description = `ВСЕ записи для кейса ${flags.caseTemplateId}`;
  }

  console.log(`\n⚠️  ВНИМАНИЕ! Будут удалены: ${description}`);
  console.log('   Это действие нельзя отменить!');
  console.log('   После удаления пользователи смогут снова получать эти предметы из кейсов.');

  // В production окружении требуем явного подтверждения
  if (process.env.NODE_ENV === 'production') {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      rl.question('\nПродолжить? Введите "YES" для подтверждения: ', (answer) => {
        rl.close();
        resolve(answer === 'YES');
      });
    });
  } else {
    console.log('\n⚡ Режим разработки: продолжаем без подтверждения...');
    return true;
  }
}

async function performCleanup(flags) {
  const whereClause = {};

  // Формируем условия для удаления
  if (flags.userId) {
    whereClause.user_id = flags.userId;
  }

  if (flags.caseTemplateId) {
    whereClause.case_template_id = flags.caseTemplateId;
  }

  // Если не указан --all и нет других параметров, не удаляем ничего
  if (!flags.all && Object.keys(whereClause).length === 0) {
    throw new Error('Не указаны параметры для очистки');
  }

  console.log('\n🗑️  Выполняем удаление...');
  console.log('   Условия:', JSON.stringify(whereClause, null, 2));

  // Выполняем удаление
  const deletedCount = await db.CaseItemDrop.destroy({
    where: whereClause
  });

  return deletedCount;
}

function showHelp() {
  console.log(`
📖 Справка по использованию:

node scripts/clear-case-drops.js [параметры]

Параметры:
  --all                              Очистить ВСЕ записи для всех пользователей и кейсов
  --user-id <user_id>               Очистить записи для конкретного пользователя
  --case-template-id <template_id>   Очистить записи для конкретного кейса
  --stats                           Показать только статистику (без удаления)
  --help                            Показать эту справку

Примеры использования:

1. Показать статистику:
   node scripts/clear-case-drops.js --stats

2. Очистить все записи для пользователя:
   node scripts/clear-case-drops.js --user-id 12345678-1234-1234-1234-123456789012

3. Очистить все записи для кейса:
   node scripts/clear-case-drops.js --case-template-id 87654321-4321-4321-4321-210987654321

4. Очистить записи для конкретного пользователя и кейса:
   node scripts/clear-case-drops.js --user-id 12345678-1234-1234-1234-123456789012 --case-template-id 87654321-4321-4321-4321-210987654321

5. ОПАСНО! Очистить все записи:
   node scripts/clear-case-drops.js --all

⚠️  ВНИМАНИЕ:
- Это действие нельзя отменить!
- После удаления записей пользователи смогут снова получать эти предметы из кейсов
- В production режиме требуется подтверждение "YES"
`);
}

// Проверяем аргументы на справку
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  showHelp();
  process.exit(0);
}

// Запускаем скрипт
main();
