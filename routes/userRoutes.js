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
  deposit,
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
  playBonusSquares,
  getBonusStatus,
  resetBonusCooldown,
  getCasesAvailable,
  getAchievementsProgress,
  adminUpdateUser,
  buyCase,
  getCasePurchaseInfo,
} = require('../controllers/user/userController');

const { loginBot, sendTrade, getSteamInventory } = require('../controllers/user/steamBotController');
const { getUserBonusInfoController } = require('../controllers/user/getUserBonusInfo');
const { verifyEmailValidation, verifyEmail } = require('../controllers/user/verifyEmail');
const { resendValidation, resendVerificationCode } = require('../controllers/user/resendVerificationCode');
const { getWithdrawalStatus } = require('../controllers/user/withdrawItem');
const { getLiveDrops } = require('../controllers/user/getLiveDrops');
const { fetchSteamTradeUrl, getTradeUrlStatus } = require('../controllers/user/fetchSteamTradeUrl');
const authMiddleware = require('../middleware/auth');
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
router.post('/logout', authMiddleware, logout); //+

router.get('/inventory', authMiddleware, getInventory); //+
router.post('/open-case', authMiddleware, openCase); //+
router.post('/sell-item', authMiddleware, sellItem);
router.post('/withdraw-item', authMiddleware, /* requireEmailVerification, */ withdrawItem);
router.get('/withdraw-item/:withdrawalId', authMiddleware, getWithdrawalStatus);
router.get('/cases', getCases); // Доступно всем для просмотра кейсов
router.get('/balance', authMiddleware, getBalance); //+
router.post('/promo', authMiddleware, applyPromo);
router.get('/transactions', authMiddleware, getTransactions);
router.post('/deposit', authMiddleware, deposit);
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
router.post('/items/exchange-for-subscription', authMiddleware, exchangeItemForSubscription); //+
router.post('/bonus/play-squares', authMiddleware, playBonusSquares); //+
router.get('/bonus/status', authMiddleware, getBonusStatus); //+
router.post('/bonus/reset-cooldown', authMiddleware, resetBonusCooldown); //+ Сброс кулдауна бонуса
router.get('/cases/available', getCasesAvailable); // Доступно всем для просмотра доступных кейсов
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

module.exports = router;
