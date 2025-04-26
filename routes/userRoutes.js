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
} = require('../controllers/userController');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Public routes
router.post('/register', registerValidation, register);
router.post('/login', login);
router.get('/users/:id', getPublicProfile);

// Protected routes
router.get('/profile', authMiddleware, getProfile);
router.put('/profile', authMiddleware, updateProfile);
router.post('/logout', authMiddleware, logout);

router.get('/inventory', authMiddleware, getInventory);
router.post('/open-case', authMiddleware, openCase);
router.post('/sell-item', authMiddleware, sellItem);
router.post('/withdraw-item', authMiddleware, withdrawItem);
router.get('/cases', authMiddleware, getCases);
router.get('/balance', authMiddleware, getBalance);
router.post('/promo', authMiddleware, applyPromo);
router.get('/transactions', authMiddleware, getTransactions);
router.post('/deposit', authMiddleware, deposit);
router.post('/withdraw-balance', authMiddleware, withdrawBalance);
router.get('/achievements', authMiddleware, getAchievements);
router.get('/missions', authMiddleware, getMissions);
router.get('/statistics', authMiddleware, getStatistics);
router.get('/leaderboard', authMiddleware, getLeaderboard);
router.get('/notifications', authMiddleware, getNotifications);

module.exports = router;
