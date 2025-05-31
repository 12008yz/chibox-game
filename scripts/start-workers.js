const { csmoneyQueue } = require('../services/csmoneyWorker');

console.log('Запуск воркера csmoneyQueue...');

csmoneyQueue.on('completed', (job, result) => {
  console.log(`Задача ${job.id} выполнена успешно`);
});

csmoneyQueue.on('failed', (job, err) => {
  console.error(`Задача ${job.id} завершилась с ошибкой:`, err);
});

// Для примера можно добавить задачу импорта при старте
(async () => {
  try {
    await csmoneyQueue.add('import-items', { offset: 0, limit: 60 });
    console.log('Задача импорта добавлена в очередь');
  } catch (error) {
    console.error('Ошибка при добавлении задачи в очередь:', error);
  }
})();
