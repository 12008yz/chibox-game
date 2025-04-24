const express = require('express');
const { registerValidation, register, login, getProfile, updateProfile, logout } = require('../controllers/userController');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Public routes
router.post('/register', registerValidation, register);
router.post('/login', login);

// Protected routes
router.get('/profile', authMiddleware, getProfile);
router.put('/profile', authMiddleware, updateProfile);
router.post('/logout', authMiddleware, logout);

module.exports = router;
