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

// const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';
// const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1d';

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
  },

  // Получить инвентарь пользователя
  async getInventory(req, res) {
    try {
      const userId = req.user.id;
      const inventory = await db.UserInventory.findAll({
        where: { userId },
        include: [{ model: db.Item, as: 'item' }]
      });
      logger.info(`Получен инвентарь для пользователя ${userId}`);
      return res.json({ inventory });
    } catch (error) {
      logger.error('Ошибка получения инвентаря:', error);
      return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
    }
  },

  // Открыть кейс
  async openCase(req, res) {
    try {
      const { caseId } = req.body;
      const userId = req.user.id;

      // Проверяем, существует ли кейс
      const caseTemplate = await db.CaseTemplate.findByPk(caseId);
      if (!caseTemplate) {
        return res.status(404).json({ message: 'Кейс не найден' });
      }

      // Получаем все предметы, которые могут выпасть из кейса
      const caseItems = await db.CaseItem.findAll({
        where: { caseId },
        include: [{ model: db.Item }]
      });

      if (!caseItems.length) {
        return res.status(404).json({ message: 'В кейсе нет предметов' });
      }

      // Пример простого выбора предмета с учетом веса (weight)
      const totalWeight = caseItems.reduce((sum, ci) => sum + ci.weight, 0);
      let random = Math.random() * totalWeight;
      let selectedItem = null;
      for (const ci of caseItems) {
        if (random < ci.weight) {
          selectedItem = ci.Item;
          break;
        }
        random -= ci.weight;
      }

      if (!selectedItem) {
        return res.status(500).json({ message: 'Ошибка выбора предмета' });
      }

      // Добавляем предмет в инвентарь пользователя
      await db.UserInventory.create({
        userId,
        itemId: selectedItem.id,
        quantity: 1
      });

      logger.info(`Пользователь ${userId} открыл кейс ${caseId} и получил предмет ${selectedItem.id}`);

      return res.json({ item: selectedItem, message: 'Кейс успешно открыт' });
    } catch (error) {
      logger.error('Ошибка открытия кейса:', error);
      return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
    }
  },

  // Продать предмет из инвентаря
  async sellItem(req, res) {
    try {
      const userId = req.user.id;
      const { itemId } = req.body;

      const inventoryItem = await db.UserInventory.findOne({ where: { userId, itemId } });
      if (!inventoryItem) {
        return res.status(404).json({ message: 'Предмет не найден в инвентаре' });
      }

      // Получаем стоимость предмета
      const item = await db.Item.findByPk(itemId);
      if (!item) {
        return res.status(404).json({ message: 'Предмет не найден' });
      }

      // Удаляем предмет из инвентаря
      await inventoryItem.destroy();

      // Обновляем баланс пользователя (эмуляция)
      const user = await db.User.findByPk(userId);
      if (user) {
        user.balance = (user.balance || 0) + item.sellPrice; // предполагается поле sellPrice
        await user.save();
      }

      logger.info(`Пользователь ${userId} продал предмет ${itemId} за ${item.sellPrice}`);

      return res.json({ success: true, message: `Предмет продан за ${item.sellPrice}` });
    } catch (error) {
      logger.error('Ошибка при продаже предмета:', error);
      return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
    }
  },

  // Запросить вывод предмета
  async withdrawItem(req, res) {
    try {
      const userId = req.user.id;
      const { itemId } = req.body;

      // Проверяем, есть ли предмет в инвентаре
      const inventoryItem = await db.UserInventory.findOne({ where: { userId, itemId } });
      if (!inventoryItem) {
        return res.status(404).json({ message: 'Предмет не найден в инвентаре' });
      }

      // Создаем заявку на вывод (Withdrawal)
      await db.Withdrawal.create({
        userId,
        itemId,
        status: 'pending', // статус заявки
        type: 'item'
      });

      logger.info(`Пользователь ${userId} запросил вывод предмета ${itemId}`);

      return res.json({ success: true, message: 'Заявка на вывод предмета создана' });
    } catch (error) {
      logger.error('Ошибка вывода предмета:', error);
      return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
    }
  },

  // Получить список кейсов
  async getCases(req, res) {
    try {
      const cases = await db.CaseTemplate.findAll();
      logger.info('Получен список кейсов');
      return res.json({ cases });
    } catch (error) {
      logger.error('Ошибка получения кейсов:', error);
      return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
    }
  },

  // Получить баланс пользователя
  async getBalance(req, res) {
    try {
      const userId = req.user.id;
      const user = await db.User.findByPk(userId);
      logger.info(`Баланс пользователя ${userId}: ${user ? user.balance : 'unknown'}`);
      return res.json({ balance: user ? user.balance : 0 });
    } catch (error) {
      logger.error('Ошибка получения баланса:', error);
      return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
    }
  },

  // Применить промокод
  async applyPromo(req, res) {
    try {
      const userId = req.user.id;
      const { code } = req.body;

      // Проверяем промокод
      const promo = await db.PromoCode.findOne({ where: { code, active: true } });
      if (!promo) {
        return res.status(404).json({ message: 'Промокод не найден или неактивен' });
      }

      // Проверяем, не использовал ли пользователь этот промокод
      const usage = await db.PromoCodeUsage.findOne({ where: { userId, promoCodeId: promo.id } });
      if (usage) {
        return res.status(400).json({ message: 'Промокод уже использован' });
      }

      // Применяем промокод (например, добавляем бонус к балансу)
      const user = await db.User.findByPk(userId);
      if (!user) {
        return res.status(404).json({ message: 'Пользователь не найден' });
      }

      user.balance = (user.balance || 0) + promo.bonusAmount; // предполагается поле bonusAmount
      await user.save();

      // Записываем использование промокода
      await db.PromoCodeUsage.create({
        userId,
        promoCodeId: promo.id,
        usedAt: new Date()
      });

      logger.info(`Пользователь ${userId} применил промокод ${code}`);

      return res.json({ success: true, message: 'Промокод успешно применён' });
    } catch (error) {
      logger.error('Ошибка применения промокода:', error);
      return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
    }
  },

  // Получить историю транзакций
  async getTransactions(req, res) {
    try {
      const userId = req.user.id;
      const transactions = await db.Transaction.findAll({ where: { userId } });
      logger.info(`История транзакций пользователя ${userId}`);
      return res.json({ transactions });
    } catch (error) {
      logger.error('Ошибка получения истории транзакций:', error);
      return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
    }
  },

  // Пополнение баланса (эмуляция)
  async deposit(req, res) {
    try {
      const userId = req.user.id;

      // Здесь должна быть интеграция с платежной системой
      // Для эмуляции возвращаем ссылку-заглушку
      const paymentUrl = 'https://payment.example.com/deposit?user=' + userId;

      logger.info(`Пользователь ${userId} инициировал пополнение баланса`);

      return res.json({ url: paymentUrl, message: 'Интеграция платежек не реализована' });
    } catch (error) {
      logger.error('Ошибка пополнения баланса:', error);
      return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
    }
  },

  // Заявка на вывод баланса (эмуляция)
  async withdrawBalance(req, res) {
    try {
      const userId = req.user.id;
      const { amount } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).json({ message: 'Некорректная сумма для вывода' });
      }

      const user = await db.User.findByPk(userId);
      if (!user) {
        return res.status(404).json({ message: 'Пользователь не найден' });
      }

      if ((user.balance || 0) < amount) {
        return res.status(400).json({ message: 'Недостаточно средств для вывода' });
      }

      // Создаем заявку на вывод баланса
      await db.Withdrawal.create({
        userId,
        amount,
        status: 'pending',
        type: 'balance'
      });

      // Уменьшаем баланс пользователя (резервируем сумму)
      user.balance -= amount;
      await user.save();

      logger.info(`Пользователь ${userId} отправил заявку на вывод баланса на сумму ${amount}`);

      return res.json({ success: true, message: 'Заявка на вывод оформлена' });
    } catch (error) {
      logger.error('Ошибка вывода баланса:', error);
      return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
    }
  },

  // Получить достижения
  async getAchievements(req, res) {
    try {
      const userId = req.user.id;
      const achievements = await db.UserAchievement.findAll({ where: { userId }, include: db.Achievement });
      return res.json({ achievements });
    } catch (error) {
      logger.error('Ошибка получения достижений:', error);
      return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
    }
  },

  // Получить миссии
  async getMissions(req, res) {
    try {
      const userId = req.user.id;
      const missions = await db.UserMission.findAll({ where: { userId }, include: db.Mission });
      return res.json({ missions });
    } catch (error) {
      logger.error('Ошибка получения миссий:', error);
      return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
    }
  },

  // Получить статистику
  async getStatistics(req, res) {
    try {
      const userId = req.user.id;

      // Пример агрегированной статистики (можно расширить)
      const totalTransactions = await db.Transaction.count({ where: { userId } });
      const totalSpent = await db.Transaction.sum('amount', { where: { userId, type: 'spend' } });
      const totalEarned = await db.Transaction.sum('amount', { where: { userId, type: 'earn' } });

      const statistics = {
        totalTransactions: totalTransactions || 0,
        totalSpent: totalSpent || 0,
        totalEarned: totalEarned || 0,
      };

      return res.json({ statistics });
    } catch (error) {
      logger.error('Ошибка получения статистики:', error);
      return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
    }
  },

  // Получить таблицу лидеров
  async getLeaderboard(req, res) {
    try {
      const leaderboard = await db.Leaderboard.findAll({
        limit: 50,
        order: [['score', 'DESC']],
        include: [{ model: db.User, as: 'user', attributes: ['id', 'username'] }]
      });
      return res.json({ leaderboard });
    } catch (error) {
      logger.error('Ошибка получения лидерборда:', error);
      return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
    }
  },

  // Получить уведомления
  async getNotifications(req, res) {
    try {
      const userId = req.user.id;
      const notifications = await db.Notification.findAll({ where: { userId } });
      return res.json({ notifications });
    } catch (error) {
      logger.error('Ошибка получения уведомлений:', error);
      return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
    }
  },

  // Получить публичный профиль
  async getPublicProfile(req, res) {
    try {
      const { id } = req.params;
      const user = await db.User.findByPk(id, {
        attributes: ['id', 'username', 'createdAt'],
      });
      if (!user) {
        return res.status(404).json({ message: 'Пользователь не найден' });
      }
      return res.json({ user });
    } catch (error) {
      logger.error('Ошибка получения публичного профиля:', error);
      return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
    }
  },

  // ---- Админ-функции (если нужно) ----
  // async banUser(req, res) { /* ... */ }
  // async unbanUser(req, res) { /* ... */ }
  // async setBalance(req, res) { /* ... */ }
  // async getAllUsers(req, res) { /* ... */ }
};
