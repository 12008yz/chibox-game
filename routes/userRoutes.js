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
  getPublicProfile,
  buySubscription,
  getSubscription,
  exchangeItemForSubscription,
  playBonusSquares,
  getBonusStatus,
  getCasesAvailable,
  getAchievementsProgress,
  buyCase,
  getCasePurchaseInfo,
} = require('../controllers/user/userController');

const { loginBot, sendTrade, getSteamInventory } = require('../controllers/user/steamBotController');
const { getUserBonusInfoController } = require('../controllers/user/getUserBonusInfo');
const authMiddleware = require('../middleware/auth');


const router = express.Router();

router.put('/admin/users/:id', authMiddleware, require('../controllers/user/userController').adminUpdateUser);


// Public routes
router.post('/register', registerValidation, register); // +
router.post('/login', login); // +
router.get('/users/:id', getPublicProfile); // +

// Protected routes
router.get('/profile', authMiddleware, getProfile);
router.put('/profile', authMiddleware, updateProfile); //+
router.post('/logout', authMiddleware, logout); //+

router.get('/inventory', authMiddleware, getInventory); //+
router.post('/open-case', authMiddleware, openCase); //+
router.post('/sell-item', authMiddleware, sellItem);
router.post('/withdraw-item', authMiddleware, withdrawItem);
router.get('/withdraw-item/:withdrawalId', authMiddleware, require('../controllers/user/withdrawItem').getWithdrawalStatus);
router.get('/cases', authMiddleware, getCases); //+
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
router.get('/notifications', authMiddleware, getNotifications); //+ (Пустое)

// New routes from userController.js
router.post('/subscription/buy', authMiddleware, buySubscription); //+
router.get('/subscription', authMiddleware, getSubscription); //+
router.post('/items/exchange-for-subscription', authMiddleware, exchangeItemForSubscription); //+
router.post('/bonus/play-squares', authMiddleware, playBonusSquares); //+
router.get('/bonus/status', authMiddleware, getBonusStatus); //+
router.get('/cases/available', authMiddleware, getCasesAvailable); //+
router.get('/achievements/progress', authMiddleware, getAchievementsProgress); //+

// Case purchase routes
router.post('/cases/buy', authMiddleware, buyCase); //+
router.get('/cases/purchase-info', authMiddleware, getCasePurchaseInfo); //+

// Steam bot routes
router.post('/steambot/login', authMiddleware, loginBot); //+
router.post('/steambot/send-trade', authMiddleware, sendTrade);
router.get('/steambot/inventory', authMiddleware, getSteamInventory); //+

module.exports = router;
