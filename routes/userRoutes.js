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
  getGlobalStatistics,
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
const getFreeCaseStatus = require('../controllers/user/getFreeCaseStatus');

const { loginBot, sendTrade, getSteamInventory } = require('../controllers/user/steamBotController');
const { getUserBonusInfoController } = require('../controllers/user/getUserBonusInfo');
const { verifyEmailValidation, verifyEmail } = require('../controllers/user/verifyEmail');
const { resendValidation, resendVerificationCode } = require('../controllers/user/resendVerificationCode');
const { getWithdrawalStatus, cancelWithdrawal } = require('../controllers/user/withdrawItem');
const playSafeCracker = require('../controllers/user/playSafeCracker');
const getSafeCrackerStatus = require('../controllers/user/getSafeCrackerStatus');
const { getLiveDrops } = require('../controllers/user/getLiveDrops');
const { fetchSteamTradeUrl, getTradeUrlStatus } = require('../controllers/user/fetchSteamTradeUrl');
const { claimSubscriptionCase, getSubscriptionCaseStatus } = require('../controllers/user/claimSubscriptionCase');
const { createGame: createTicTacToeGame, getCurrentGame: getCurrentTicTacToeGame, makeMove: makeTicTacToeMove } = require('../controllers/user/ticTacToeController');
const { getUpgradeableItems, getUpgradeOptions, performUpgrade } = require('../controllers/user/upgradeItem');
const { topUpBalance } = require('../controllers/user/topUpBalance');
const getCurrency = require('../controllers/user/getCurrency');
// const { uploadAvatar, deleteAvatar, uploadMiddleware } = require('../controllers/user/uploadAvatar'); // DISABLED - only Steam avatars
const getAvatars = require('../controllers/user/getAvatars');
const updateAvatar = require('../controllers/user/updateAvatar');
const authMiddleware = require('../middleware/auth');
const optionalAuthMiddleware = require('../middleware/optionalAuth');
const { requireEmailVerification } = require('../middleware/emailVerification');
const rateLimit = require('express-rate-limit');

// Rate limiter для авторизованных пользователей (по user_id)
const createUserRateLimit = (windowMs, max, message) => rateLimit({
  windowMs,
  max,
  message,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Используем user_id после аутентификации
    return req.user && req.user.id ? `user_${req.user.id}` : req.ip;
  },
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: message,
      error: 'RATE_LIMIT_EXCEEDED',
      retryAfter: Math.ceil(windowMs / 1000)
    });
  }
});

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

// Avatar routes
router.get('/avatars', getAvatars); // Получение списка доступных аватаров
router.put('/avatar', authMiddleware, updateAvatar); // Обновление аватара пользователя

// Avatar upload with error handling - DISABLED (only Steam avatars allowed)
// router.post('/profile/avatar', authMiddleware, (req, res, next) => {
//   console.log('🔍 Avatar upload route hit');
//   console.log('Content-Type:', req.get('content-type'));
//   uploadMiddleware(req, res, (err) => {
//     if (err) {
//       console.error('❌ Multer error:', err);
//       return res.status(400).json({
//         success: false,
//         message: err.message || 'Ошибка при загрузке файла'
//       });
//     }
//     next();
//   });
// }, uploadAvatar);

// router.delete('/profile/avatar', authMiddleware, deleteAvatar); // Delete avatar
router.post('/logout', authMiddleware, logout); //+

router.get('/inventory', authMiddleware, getInventory); //+
// ИСПРАВЛЕНИЕ: добавлен rate limiter по user_id (60 запросов в минуту на пользователя)
router.post('/open-case', authMiddleware, createUserRateLimit(60 * 1000, 60, 'Слишком быстро открываете кейсы'), openCase); //+
router.post('/sell-item', authMiddleware, sellItem);
router.post('/withdraw-item', authMiddleware, /* requireEmailVerification, */ withdrawItem);
router.get('/withdraw-item/:withdrawalId', authMiddleware, getWithdrawalStatus);
router.post('/withdraw-item/:withdrawalId/cancel', authMiddleware, cancelWithdrawal);
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
router.get('/statistics/global', getGlobalStatistics); // Глобальная статистика сайта (без авторизации)
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
router.post('/games/play-safe-cracker', authMiddleware, playSafeCracker); // Игра Safe Cracker
router.get('/games/safe-cracker-status', authMiddleware, getSafeCrackerStatus); // Статус игры Safe Cracker
router.get('/bonus/status', authMiddleware, getBonusStatus); //+
router.post('/bonus/reset-cooldown', authMiddleware, resetBonusCooldown); //+ Сброс кулдауна бонуса
router.get('/cases/available', getCasesAvailable); // Доступно всем для просмотра доступных кейсов
router.get('/case-templates/:caseTemplateId/items', optionalAuthMiddleware, getCaseTemplateItems); // Получение предметов кейс-темплейта с опциональной аутентификацией
router.get('/case-templates/:caseTemplateId/status', authMiddleware, getCaseStatus); // Получение статуса кейса
router.get('/free-case/status', authMiddleware, getFreeCaseStatus); // Получение статуса бесплатного кейса для новых пользователей
router.get('/achievements/progress', authMiddleware, getAchievementsProgress); //+

// Case purchase routes
// ИСПРАВЛЕНИЕ: добавлен rate limiter по user_id (15 запросов в минуту на пользователя)
router.post('/cases/buy', authMiddleware, createUserRateLimit(60 * 1000, 15, 'Слишком много покупок'), buyCase); //+
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
