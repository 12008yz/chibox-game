require('dotenv').config();
const argon2 = require('argon2');
const jwt = require('jsonwebtoken');
const { validationResult, body } = require('express-validator');
const winston = require('winston');
const db = require('../models');

// winston logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
  ],
});

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1d';

function generateToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

// Validation for registration
const registerValidation = [
  body('email')
    .trim()
    .isEmail().withMessage('Некорректный email.')
    .normalizeEmail(),
  body('username')
    .trim().notEmpty().withMessage('Имя пользователя обязательно.'),
  body('password')
    .isLength({ min: 8 }).withMessage('Пароль должен быть не менее 8 символов.')
    .matches(/[A-Z]/).withMessage('Пароль должен содержать хотя бы одну заглавную букву')
    .matches(/[a-z]/).withMessage('Пароль должен содержать хотя бы одну строчную букву')
    .matches(/[0-9]/).withMessage('Пароль должен содержать хотя бы одну цифру')
    .matches(/[^A-Za-z0-9]/).withMessage('Пароль должен содержать спецсимвол')
];

module.exports = {
  registerValidation,

  // User registration
  async register(req, res) {
    // Validation
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Ошибка валидации',
        errors: errors.array()
      });
    }
    try {
      let { email, password, username } = req.body;
      email = email.trim().toLowerCase();
      const existingUser = await db.User.findOne({ where: { email } });
      if (existingUser) {
        return res.status(409).json({ message: 'Почта уже используется' });
      }
      const hashedPassword = await argon2.hash(password);
      const newUser = await db.User.create({
        email,
        username: username.trim(),
        password: hashedPassword,
      });
      const token = generateToken(newUser);
      logger.info(`Пользователь зарегистрирован: ${newUser.email}`);
      return res.status(201).json({
        success: true,
        token,
        user: {
          id: newUser.id,
          email: newUser.email,
          username: newUser.username,
        },
      });
    } catch (error) {
      logger.error('Ошибка при регистрации:', error);
      return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
    }
  },

  // User login
  async login(req, res) {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ message: 'Email и пароль обязательны' });
      }

      const user = await db.User.findOne({ where: { email: email.trim().toLowerCase() } });
      if (!user) {
        return res.status(401).json({ message: 'Неверный email или пароль' });
      }

      const passwordMatch = await argon2.verify(user.password, password);
      if (!passwordMatch) {
        return res.status(401).json({ message: 'Неверный email или пароль' });
      }

      const token = generateToken(user);
      logger.info(`Пользователь вошел: ${user.email}`);
      return res.json({
        success: true,
        token,
        user: { id: user.id, email: user.email, username: user.username }
      });
    } catch (error) {
      logger.error('Ошибка при входе:', error);
      return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
    }
  },

  // Get current user profile
  async getProfile(req, res) {
    try {
      const userId = req.user.id;
      const user = await db.User.findByPk(userId, {
        attributes: ['id', 'email', 'username', 'createdAt', 'updatedAt']
      });
      if (!user) {
        return res.status(404).json({ message: 'Пользователь не найден' });
      }
      return res.json(user);
    } catch (error) {
      logger.error('Ошибка получения профиля:', error);
      return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
    }
  },

  // Update current user profile
  async updateProfile(req, res) {
    try {
      const userId = req.user.id;
      const { username, password } = req.body;

      const user = await db.User.findByPk(userId);
      if (!user) {
        return res.status(404).json({ message: 'Пользователь не найден' });
      }

      if (username) {
        user.username = username.trim();
      }
      if (password) {
        if (password.length < 8) {
          return res.status(400).json({ message: 'Пароль должен быть не менее 8 символов' });
        }
        user.password = await argon2.hash(password);
      }

      await user.save();

      logger.info(`Профиль пользователя обновлен: ${user.email}`);
      return res.json({ message: 'Профиль успешно обновлен' });
    } catch (error) {
      logger.error('Ошибка обновления профиля:', error);
      return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
    }
  },

  // Logout (optional, client can just discard token)
  logout(req, res) {
    // For JWT, logout is handled client-side by discarding token
    return res.json({ message: 'Успешный выход' });
  }
};
