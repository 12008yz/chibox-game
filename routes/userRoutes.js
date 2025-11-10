const express = require('express');
const {
  registerValidation,
  register,
  login,
  getProfile,
  updateProfile,
  logout,
  getInventory,
  openCase,
  sellItem,
  withdrawItem,
  getCases,
  getBalance,
  applyPromo,
  getTransactions,
  withdrawBalance,
  getAchievements,
  getMissions,
  getStatistics,
  getLeaderboard,
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getPublicProfile,
  buySubscription,
  getSubscription,
  exchangeItemForSubscription,
  getBonusStatus,
  resetBonusCooldown,
  getCasesAvailable,
  getAchievementsProgress,
  adminUpdateUser,
  buyCase,
  getCasePurchaseInfo,
  getCaseTemplateItems,
  getCaseStatus,
} = require('../controllers/user/userController');

const { getSubscriptionTiers } = require('../controllers/user/getSubscriptionTiers');

const { loginBot, sendTrade, getSteamInventory } = require('../controllers/user/steamBotController');
const { getUserBonusInfoController } = require('../controllers/user/getUserBonusInfo');
const { verifyEmailValidation, verifyEmail } = require('../controllers/user/verifyEmail');
const { resendValidation, resendVerificationCode } = require('../controllers/user/resendVerificationCode');
const { getWithdrawalStatus } = require('../controllers/user/withdrawItem');
const playRoulette = require('../controllers/user/playRoulette');
const playPlinko = require('../controllers/user/playPlinko');
const playSlot = require('../controllers/user/playSlot');
const { getSlotItems } = require('../controllers/user/getSlotItems');
const getSlotStatus = require('../controllers/user/getSlotStatus');
const { getLiveDrops } = require('../controllers/user/getLiveDrops');
const { fetchSteamTradeUrl, getTradeUrlStatus } = require('../controllers/user/fetchSteamTradeUrl');
const { claimSubscriptionCase, getSubscriptionCaseStatus } = require('../controllers/user/claimSubscriptionCase');
const { createGame: createTicTacToeGame, getCurrentGame: getCurrentTicTacToeGame, makeMove: makeTicTacToeMove } = require('../controllers/user/ticTacToeController');
const { getUpgradeableItems, getUpgradeOptions, performUpgrade } = require('../controllers/user/upgradeItem');
const { topUpBalance } = require('../controllers/user/topUpBalance');
const getCurrency = require('../controllers/user/getCurrency');
const { uploadAvatar, deleteAvatar, uploadMiddleware } = require('../controllers/user/uploadAvatar');
const authMiddleware = require('../middleware/auth');
const optionalAuthMiddleware = require('../middleware/optionalAuth');
const { requireEmailVerification } = require('../middleware/emailVerification');


const router = express.Router();

// Диагностический эндпоинт для проверки соединения
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Backend API работает',
    timestamp: new Date().toISOString(),
    headers: req.headers,
    method: req.method,
    url: req.url
  });
});

router.post('/test-post', (req, res) => {
  res.json({
    success: true,
    message: 'POST запрос работает',
    body: req.body,
    headers: req.headers,
    contentType: req.get('Content-Type')
  });
});

router.put('/admin/users/:id', authMiddleware, adminUpdateUser);


// Public routes
router.post('/register', registerValidation, register); // +
router.post('/login', login); // +
router.post('/verify-email', verifyEmailValidation, verifyEmail); // Email verification
router.post('/resend-verification-code', resendValidation, resendVerificationCode); // Resend verification code
router.get('/users/:id', getPublicProfile); // +
router.get('/live-drops', getLiveDrops); // + Публичное API для живого падения

// Protected routes
router.get('/profile', authMiddleware, getProfile);
router.put('/profile', authMiddleware, updateProfile); //+

// Avatar upload with error handling
router.post('/profile/avatar', authMiddleware, (req, res, next) => {
  console.log('🔍 Avatar upload route hit');
  console.log('Content-Type:', req.get('content-type'));
  uploadMiddleware(req, res, (err) => {
    if (err) {
      console.error('❌ Multer error:', err);
      return res.status(400).json({
        success: false,
        message: err.message || 'Ошибка при загрузке файла'
      });
    }
    next();
  });
}, uploadAvatar);

router.delete('/profile/avatar', authMiddleware, deleteAvatar); // Delete avatar
router.post('/logout', authMiddleware, logout); //+

router.get('/inventory', authMiddleware, getInventory); //+
router.post('/open-case', authMiddleware, openCase); //+
router.post('/sell-item', authMiddleware, sellItem);
router.post('/withdraw-item', authMiddleware, /* requireEmailVerification, */ withdrawItem);
router.get('/withdraw-item/:withdrawalId', authMiddleware, getWithdrawalStatus);
router.get('/cases', getCases); // Доступно всем для просмотра кейсов
router.get('/balance', authMiddleware, getBalance); //+
router.post('/balance/top-up', authMiddleware, topUpBalance); //+
router.get('/currency', getCurrency); // Получить информацию о валютах и курсах
router.post('/promo', authMiddleware, applyPromo);
router.get('/transactions', authMiddleware, getTransactions);

router.post('/withdraw-balance', authMiddleware, withdrawBalance);
router.get('/achievements', authMiddleware, getAchievements); //+
router.get('/missions', authMiddleware, getMissions);
router.get('/statistics', authMiddleware, getStatistics); //+
router.get('/bonus-info', authMiddleware, getUserBonusInfoController); // Получить информацию о бонусах
router.get('/leaderboard', authMiddleware, getLeaderboard); //+
router.get('/notifications', authMiddleware, getNotifications); //+
router.get('/notifications/unread-count', authMiddleware, getUnreadCount); //+
router.put('/notifications/:notificationId/read', authMiddleware, markAsRead); //+
router.put('/notifications/mark-all-read', authMiddleware, markAllAsRead); //+
router.delete('/notifications/:notificationId', authMiddleware, deleteNotification); //+

// New routes from userController.js
router.post('/subscription/buy', authMiddleware, buySubscription); //+
router.get('/subscription', authMiddleware, getSubscription); //+
router.get('/subscription/tiers', getSubscriptionTiers); // Public route for subscription tiers
router.post('/items/exchange-for-subscription', authMiddleware, exchangeItemForSubscription); //+
router.post('/bonus/play-roulette', authMiddleware, playRoulette); //+
router.post('/games/play-plinko', authMiddleware, playPlinko); // Игра в Plinko
router.post('/games/play-slot', authMiddleware, playSlot); // Игра в слот
router.get('/games/slot-items', getSlotItems); // Получение предметов для слота (публичный endpoint)
router.get('/games/slot-status', authMiddleware, getSlotStatus); // Получение статуса слота для пользователя
router.get('/bonus/status', authMiddleware, getBonusStatus); //+
router.post('/bonus/reset-cooldown', authMiddleware, resetBonusCooldown); //+ Сброс кулдауна бонуса
router.get('/cases/available', getCasesAvailable); // Доступно всем для просмотра доступных кейсов
router.get('/case-templates/:caseTemplateId/items', optionalAuthMiddleware, getCaseTemplateItems); // Получение предметов кейс-темплейта с опциональной аутентификацией
router.get('/case-templates/:caseTemplateId/status', authMiddleware, getCaseStatus); // Получение статуса кейса
router.get('/achievements/progress', authMiddleware, getAchievementsProgress); //+

// Case purchase routes
router.post('/cases/buy', authMiddleware, buyCase); //+
router.get('/cases/purchase-info', authMiddleware, getCasePurchaseInfo); //+

// Steam bot routes
router.post('/steambot/login', authMiddleware, loginBot); //+
router.post('/steambot/send-trade', authMiddleware, sendTrade);
router.get('/steambot/inventory', authMiddleware, getSteamInventory); //+

// Steam Trade URL routes
router.post('/steam/fetch-trade-url', authMiddleware, fetchSteamTradeUrl); // Автоматическое получение Trade URL
router.get('/steam/trade-url-status', authMiddleware, getTradeUrlStatus); // Проверка статуса Trade URL

// Subscription daily cases routes
router.post('/subscription/claim-case', authMiddleware, claimSubscriptionCase); // Получение ежедневных кейсов подписки
router.get('/subscription/case-status', authMiddleware, getSubscriptionCaseStatus); // Статус доступности кейсов подписки

// Tic-Tac-Toe game routes
router.post('/tic-tac-toe/new-game', authMiddleware, createTicTacToeGame); // Создание новой игры крестики-нолики
router.get('/tic-tac-toe/current-game', authMiddleware, getCurrentTicTacToeGame); // Получение текущей игры
router.post('/tic-tac-toe/move', authMiddleware, makeTicTacToeMove); // Совершение хода

// Upgrade routes
router.get('/upgrade/items', authMiddleware, getUpgradeableItems); // Получение предметов для апгрейда
router.get('/upgrade/options/:itemIds', authMiddleware, (req, res) => {
  // Преобразуем параметры из URL path в query string для совместимости с существующим контроллером
  req.query.itemIds = req.params.itemIds;
  getUpgradeOptions(req, res);
}); // Получение вариантов апгрейда (с параметрами в URL) - ДОЛЖЕН БЫТЬ ПЕРВЫМ
router.get('/upgrade/options', authMiddleware, getUpgradeOptions); // Получение вариантов апгрейда (с query параметрами)
router.post('/upgrade/perform', authMiddleware, performUpgrade); // Выполнение апгрейда

module.exports = router;
