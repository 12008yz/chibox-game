// Тест экспортов userController

console.log('🧪 Тестирование экспортов userController...\n');

try {
  // Импортируем весь userController
  const userController = require('./controllers/user/userController');

  console.log('📋 Проверяем все экспорты из userController:');

  const expectedExports = [
    'registerValidation',
    'register',
    'login',
    'getProfile',
    'updateProfile',
    'logout',
    'getInventory',
    'openCase',
    'sellItem',
    'withdrawItem',
    'getCases',
    'getBalance',
    'applyPromo',
    'getTransactions',
    'deposit',
    'withdrawBalance',
    'getAchievements',
    'getMissions',
    'getStatistics',
    'getLeaderboard',
    'getNotifications',
    'getPublicProfile',
    'buySubscription',
    'getSubscription',
    'exchangeItemForSubscription',
    'playBonusSquares',
    'getBonusStatus',
    'getCasesAvailable',
    'getAchievementsProgress',
    'buyCase',
    'getCasePurchaseInfo'
  ];

  expectedExports.forEach(exportName => {
    if (userController[exportName]) {
      console.log(`✅ ${exportName}: ${typeof userController[exportName]}`);
    } else {
      console.log(`❌ ${exportName}: undefined или отсутствует`);
    }
  });

  // Проверяем есть ли неожиданные экспорты
  console.log('\n📋 Все экспорты из userController:');
  Object.keys(userController).forEach(key => {
    console.log(`- ${key}: ${typeof userController[key]}`);
  });

} catch (error) {
  console.error('❌ Ошибка при проверке userController:', error.message);
  console.error('🔍 Стек ошибки:', error.stack);
}
