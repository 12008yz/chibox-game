require('dotenv').config();
const argon2 = require('argon2');
const jwt = require('jsonwebtoken');
const { validationResult, body } = require('express-validator');
const winston = require('winston');
const db = require('../models');
const { Op } = require('sequelize');

// Параметры уровней подписки, соответствующие tierId
const subscriptionTiers = {
  1: { days: 30, max_daily_cases: 3, bonus_percentage: 3.0, name: 'Статус', price: 1210 },
  2: { days: 30, max_daily_cases: 5, bonus_percentage: 5.0, name: 'Статус+', price: 2890 },
  3: { days: 30, max_daily_cases: 10, bonus_percentage: 10.0, name: 'Статус++', price: 6819 }
};

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
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Ошибка валидации',
        errors: errors.array(),
      });
    }
    try {
      let { email, password, username } = req.body;
      email = email.trim().toLowerCase();

      const existingUser = await db.User.findOne({ where: { email } });
      if (existingUser) {
        return res.status(409).json({ message: 'Почта уже используется' });
      }

      const existingUsername = await db.User.findOne({ where: { username: username.trim() } });
      if (existingUsername) {
        return res.status(409).json({ message: 'Имя пользователя уже занято' });
      }

      const hashedPassword = await argon2.hash(password);

      // Создаём пользователя
      const newUser = await db.User.create({
        email,
        username: username.trim(),
        password: hashedPassword
        // остальные поля будут с дефолтами из модели
      });

      // (!!!) Не забывай, что UserAchievement и UserInventory должны создаваться с user_id = newUser.id

      // Получаем достижения пользователя (обычно пусто при создании)
      const achievements = await db.UserAchievement.findAll({
        where: { user_id: newUser.id },
        include: [{ model: db.Achievement, as: 'achievement' }]
      });

      // Получаем инвентарь пользователя (пусто на старте)
      const inventory = await db.UserInventory.findAll({
        where: { user_id: newUser.id },
        include: [{ model: db.Item, as: 'item' }]
      });

      const token = generateToken(newUser);

      return res.status(201).json({
        success: true,
        token,
        user: {
          id: newUser.id,
          email: newUser.email,
          username: newUser.username,
          level: newUser.level,
          xp: newUser.xp,
          xp_to_next_level: newUser.xp_to_next_level,
          level_bonus_percentage: newUser.level_bonus_percentage,
          total_xp_earned: newUser.total_xp_earned,
          subscription_tier: newUser.subscription_tier,
          subscription_purchase_date: newUser.subscription_purchase_date,
          subscription_expiry_date: newUser.subscription_expiry_date,
          subscription_days_left: newUser.subscription_days_left,
          cases_available: newUser.cases_available,
          cases_opened_today: newUser.cases_opened_today,
          next_case_available_time: newUser.next_case_available_time,
          max_daily_cases: newUser.max_daily_cases,
          next_bonus_available_time: newUser.next_bonus_available_time,
          last_bonus_date: newUser.last_bonus_date,
          lifetime_bonuses_claimed: newUser.lifetime_bonuses_claimed,
          successful_bonus_claims: newUser.successful_bonus_claims,
          drop_rate_modifier: newUser.drop_rate_modifier,
          achievements_bonus_percentage: newUser.achievements_bonus_percentage,
          subscription_bonus_percentage: newUser.subscription_bonus_percentage,
          total_drop_bonus_percentage: newUser.total_drop_bonus_percentage,
          balance: newUser.balance,
          // Steam info если нужно:
          steam_id: newUser.steam_id,
          steam_username: newUser.steam_username,
          steam_avatar: newUser.steam_avatar,
          steam_profile_url: newUser.steam_profile_url,
          steam_trade_url: newUser.steam_trade_url,
          is_email_verified: newUser.is_email_verified,
          role: newUser.role,
        },
        achievements, // массив с достижениями пользователя
        inventory     // массив с предметами пользователя
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
  
      // Находим пользователя
      const user = await db.User.findOne({ where: { email: email.trim().toLowerCase() } });
      if (!user) {
        return res.status(401).json({ message: 'Неверный email или пароль' });
      }
  
      // Проверяем пароль
      const passwordMatch = await argon2.verify(user.password, password);
      if (!passwordMatch) {
        return res.status(401).json({ message: 'Неверный email или пароль' });
      }
  
      // Загружаем достижения и инвентарь
      const achievements = await db.UserAchievement.findAll({
        where: { user_id: user.id },
        include: [{ model: db.Achievement, as: 'achievement' }]
      });
  
      const inventory = await db.UserInventory.findAll({
        where: { user_id: user.id },
        include: [{ model: db.Item, as: 'item' }]
      });
  
      // Формируем токен
      const token = generateToken(user);
  
      // Формируем user-объект для ответа
      return res.json({
        success: true,
        token,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          level: user.level,
          xp: user.xp,
          xp_to_next_level: user.xp_to_next_level,
          level_bonus_percentage: user.level_bonus_percentage,
          total_xp_earned: user.total_xp_earned,
          subscription_tier: user.subscription_tier,
          subscription_purchase_date: user.subscription_purchase_date,
          subscription_expiry_date: user.subscription_expiry_date,
          subscription_days_left: user.subscription_days_left,
          cases_available: user.cases_available,
          cases_opened_today: user.cases_opened_today,
          next_case_available_time: user.next_case_available_time,
          max_daily_cases: user.max_daily_cases,
          next_bonus_available_time: user.next_bonus_available_time,
          last_bonus_date: user.last_bonus_date,
          lifetime_bonuses_claimed: user.lifetime_bonuses_claimed,
          successful_bonus_claims: user.successful_bonus_claims,
          drop_rate_modifier: user.drop_rate_modifier,
          achievements_bonus_percentage: user.achievements_bonus_percentage,
          subscription_bonus_percentage: user.subscription_bonus_percentage,
          total_drop_bonus_percentage: user.total_drop_bonus_percentage,
          balance: user.balance,
          // Steam info если надо:
          steam_id: user.steam_id,
          steam_username: user.steam_username,
          steam_avatar: user.steam_avatar,
          steam_profile_url: user.steam_profile_url,
          steam_trade_url: user.steam_trade_url,
          is_email_verified: user.is_email_verified,
          role: user.role,
        },
        achievements,
        inventory
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

    // Получить пользователя по id — все важные поля из модели
    const user = await db.User.findByPk(userId, {
      // Возвращаем ВСЕ игровые, подписочные и сервисные поля
      attributes: [
        'id', 'email', 'username', 'createdAt', 'updatedAt', 'role', 'is_email_verified',
        'level', 'xp', 'xp_to_next_level', 'level_bonus_percentage', 'total_xp_earned',
        'subscription_tier', 'subscription_purchase_date', 'subscription_expiry_date', 'subscription_days_left',
        'cases_available', 'cases_opened_today', 'next_case_available_time', 'max_daily_cases',
        'next_bonus_available_time', 'last_bonus_date', 'lifetime_bonuses_claimed', 'successful_bonus_claims',
        'drop_rate_modifier', 'achievements_bonus_percentage', 'subscription_bonus_percentage', 'total_drop_bonus_percentage',
        'balance',
        'steam_id', 'steam_username', 'steam_avatar', 'steam_profile_url', 'steam_trade_url'
      ]
    });

    if (!user) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    // Достижения пользователя
      const achievements = await db.UserAchievement.findAll({
        where: { user_id: userId },
        include: [{ model: db.Achievement, as: 'achievement' }]
      });

    // Инвентарь пользователя
    const inventory = await db.UserInventory.findAll({
      where: { user_id: userId },
      include: [{ model: db.Item, as: 'item' }]
    });

    return res.json({
      success: true,
      user,
      achievements,
      inventory
    });

  } catch (error) {
    logger.error('Ошибка получения профиля:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
},

  // Update current user profile
  async updateProfile(req, res) {
    try {
      const userId = req.user.id;
      const { username, password, steam_trade_url } = req.body;
  
      const user = await db.User.findByPk(userId);
      if (!user) {
        return res.status(404).json({ message: 'Пользователь не найден' });
      }
  
      // Проверка уникальности username, если изменяется
      if (username && username.trim() !== user.username) {
        const usernameExists = await db.User.findOne({
          where: { username: username.trim(), id: { [db.Sequelize.Op.ne]: userId } }
        });
        if (usernameExists) {
          return res.status(409).json({ message: 'Такой username уже занят' });
        }
        user.username = username.trim();
      }
  
      // Валидация пароля
      if (password) {
        if (password.length < 8
            || !/[A-Z]/.test(password)
            || !/[a-z]/.test(password)
            || !/[0-9]/.test(password)
            || !/[^A-Za-z0-9]/.test(password)
        ) {
          return res.status(400).json({ message: 'Пароль должен быть не менее 8 символов и содержать строчные, заглавные буквы, цифру и спецсимвол.' });
        }
        user.password = await argon2.hash(password);
      }
  
      // Пример обновления дополнительного поля
      if (steam_trade_url) {
        user.steam_trade_url = steam_trade_url.trim();
      }
  
      await user.save();
  
      logger.info(`Профиль пользователя обновлен: ${user.email}`);
  
      // Отправляем актуальный user-объект, чтобы фронт мгновенно обновился
      return res.json({
        message: 'Профиль успешно обновлен',
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          // если надо, добавь остальные игровые поля как login/getProfile
          steam_trade_url: user.steam_trade_url
        }
      });
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
        where: { user_id: userId },
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

      // Получаем пользователя
      const user = await db.User.findByPk(userId);
      if (!user) {
        return res.status(404).json({ message: 'Пользователь не найден' });
      }

      // Проверяем лимит кейсов по подписке
      if (user.cases_opened_today >= user.max_daily_cases) {
        return res.status(400).json({ message: 'Достигнут лимит открытия кейсов на сегодня' });
      }

      // Проверяем время следующего доступного кейса
      const now = new Date();
      if (user.next_case_available_time && user.next_case_available_time > now) {
        return res.status(400).json({ message: 'Следующий кейс будет доступен позже', next_case_available_time: user.next_case_available_time });
      }

      // Проверяем, существует ли кейс
      const caseTemplate = await db.CaseTemplate.findByPk(caseId, {
        include: [{
          model: db.Item,
          as: 'items',
          through: { attributes: [] }
        }]
      });
      if (!caseTemplate) {
        return res.status(404).json({ message: 'Кейс не найден' });
      }

      // Получаем кейс пользователя с шаблоном и результатом (если открыт)
      const userCase = await db.Case.findOne({
        where: { id: caseId, user_id: userId, is_opened: false },
        include: [
          { model: db.CaseTemplate, as: 'template' },
          { model: db.Item, as: 'result_item' }
        ]
      });

      if (!userCase) {
        return res.status(404).json({ message: 'Кейс не найден или уже открыт' });
      }

      // Выбираем случайный предмет из связанных с шаблоном кейса items
      const items = caseTemplate.items || [];
      if (!items.length) {
        return res.status(404).json({ message: 'В кейсе нет предметов' });
      }

      // Случайный выбор предмета с учетом drop_weight
      const totalWeight = items.reduce((sum, item) => sum + (item.drop_weight || 1), 0);
      let randomWeight = Math.random() * totalWeight;
      let selectedItem = null;
      for (const item of items) {
        randomWeight -= (item.drop_weight || 1);
        if (randomWeight <= 0) {
          selectedItem = item;
          break;
        }
      }
      if (!selectedItem) {
        selectedItem = items[items.length - 1];
      }

      userCase.is_opened = true;
      userCase.opened_date = new Date();
      userCase.result_item_id = selectedItem.id;
      await userCase.save();

      // Добавляем предмет в инвентарь пользователя
      await db.UserInventory.create({
        user_id: userId,
        itemId: selectedItem.id,
        quantity: 1,
        case_id: userCase.id
      });

      // Обновляем данные пользователя
      user.cases_opened_today += 1;
      user.next_case_available_time = new Date(now.getTime() + 60 * 60 * 1000);
      await user.save();

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
        user_id: userId,
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
      const usage = await db.PromoCodeUsage.findOne({ where: { user_id: userId, promoCodeId: promo.id } });
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
        user_id: userId,
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
      const transactions = await db.Transaction.findAll({ where: { user_id: userId } });
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
        user_id: userId,
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
      const achievements = await db.UserAchievement.findAll({ where: { user_id: userId }, include: db.Achievement });
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
      const missions = await db.UserMission.findAll({ where: { user_id: userId }, include: db.Mission });
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
      const totalTransactions = await db.Transaction.count({ where: { user_id: userId } });
      const totalSpent = await db.Transaction.sum('amount', { where: { user_id: userId, type: 'spend' } });
      const totalEarned = await db.Transaction.sum('amount', { where: { user_id: userId, type: 'earn' } });

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
      const notifications = await db.Notification.findAll({ where: { user_id: userId } });
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

  /**
   * Купить или продлить подписку
   * POST /subscription/buy
   * body: { tierId, method } // method: balance, card, item, promo и т.д.
   */
  async buySubscription(req, res) {
    try {
      const userId = req.user.id;
      const { tierId, method, itemId, promoCode } = req.body;
      const user = await db.User.findByPk(userId);
      const tier = subscriptionTiers[tierId];
      if (!tier) return res.status(404).json({ message: 'Тариф не найден' });

      // Проверка возможности оплаты (метод balance, card, item...)
      // TODO: реализовать карт-платежи при необходимости
      let price = tier.price || 0; // Цена не задана в константах, можно добавить при необходимости
      let action = 'purchase';
      let exchangeItemId = null;

      if (method === 'balance') {
        logger.info(`Баланс пользователя до покупки: ${user.balance}`);
        if ((user.balance || 0) < price) return res.status(400).json({ message: 'Недостаточно средств' });
        user.balance -= price;
        logger.info(`Баланс пользователя после покупки: ${user.balance}`);
      } else if (method === 'item') {
        // Поиск правила обмена
        const rule = await db.ItemSubscriptionExchangeRule.findOne({
          where: { item_id: itemId, subscription_tier_id: parseInt(tierId) },
        });
        if (!rule) return res.status(400).json({ message: 'Нельзя обменять данный предмет' });
        const inventoryItem = await db.UserInventory.findOne({ where: { userId, itemId } });
        if (!inventoryItem) return res.status(404).json({ message: 'У пользователя нет предмета' });
        exchangeItemId = itemId;
        price = 0;
        action = 'exchange_item';
        // удаляем предмет
        await inventoryItem.destroy();
      } else if (method === 'promo') {
        // TODO: интеграция для промокода
        // price = 0, action = 'promo'
        action = 'promo';
      } else if (method === 'card') {
        // Здесь должна быть интеграция с платежкой
        return res.status(400).json({ message: 'Платёжные карты ещё не реализованы' });
      }

      // Продление/апгрейд
      const now = new Date();
      if (user.subscription_tier && user.subscription_expiry_date && user.subscription_expiry_date > now && user.subscription_tier === parseInt(tierId)) {
        // Продление текущего тарифа
        user.subscription_expiry_date = new Date(Math.max(now, user.subscription_expiry_date));
        user.subscription_expiry_date.setDate(user.subscription_expiry_date.getDate() + tier.days);
      } else {
        // Покупка новой подписки или апгрейд/смена уровня
        user.subscription_tier = parseInt(tierId);
        user.subscription_purchase_date = now;
        user.subscription_expiry_date = new Date(now.getTime() + tier.days * 86400000);
      }
      user.max_daily_cases = tier.max_daily_cases;
      user.subscription_bonus_percentage = tier.bonus_percentage;
      await user.save();

      // Автоматическая выдача ежедневных кейсов при покупке/продлении подписки
      const caseTemplates = await db.CaseTemplate.findAll({
        where: {
          type: 'daily',
          min_subscription_tier: {
            [db.Sequelize.Op.lte]: parseInt(tierId)
          },
          is_active: true
        }
      });

      for (const template of caseTemplates) {
        // Проверяем, есть ли уже кейс для пользователя и данного шаблона, который не открыт и не истёк
        const existingCase = await db.Case.findOne({
          where: {
            user_id: userId,
            template_id: template.id,
            is_opened: false,
            [db.Sequelize.Op.or]: [
              { expires_at: null },
              { expires_at: { [db.Sequelize.Op.gt]: now } }
            ]
          }
        });
        if (!existingCase) {
          await db.Case.create({
            user_id: userId,
            template_id: template.id,
            subscription_tier: parseInt(tierId),
            source: 'subscription',
            received_date: now,
            expires_at: new Date(now.getTime() + template.cooldown_hours * 3600000)
          });
        }
      }

      // Записываем в историю
      await db.SubscriptionHistory.create({
        user_id: userId,
        action,
        days: tier.days,
        price,
        item_id: exchangeItemId,
        method: method,
        date: now
      });
      logger.info(`Пользователь ${userId} приобрёл подписку tier=${tierId}`);
      return res.json({
        success: true,
        tier: {
          id: parseInt(tierId),
          name: tier.name,
          expiry_date: user.subscription_expiry_date,
          bonus: tier.bonus_percentage,
          max_daily_cases: tier.max_daily_cases
        },
        balance: user.balance,
        message: 'Подписка успешно активирована'
      });
    } catch (error) {
      logger.error('Ошибка покупки подписки:', error);
      return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
    }
  },

  /**
   * Получить активную подписку пользователя
   * GET /subscription
   */
  async getSubscription(req, res) {
    try {
      const userId = req.user.id;
      const user = await db.User.findByPk(userId);
      if (!user) return res.status(404).json({ message: 'Пользователь не найден' });
      if (!user.subscription_tier) return res.json({ tier: null, expiry_date: null, days_left: 0 });
      const tier = subscriptionTiers[user.subscription_tier];
      const now = new Date();
      const expiry = user.subscription_expiry_date;
      const daysLeft = expiry ? Math.max(0, Math.floor((expiry - now) / 86400000)) : 0;
      return res.json({
        id: user.subscription_tier,
        name: tier ? tier.name : null,
        expiry_date: expiry,
        days_left: daysLeft,
        bonus_percentage: tier ? tier.bonus_percentage : 0,
        max_daily_cases: tier ? tier.max_daily_cases : 0
      });
    } catch (error) {
      logger.error('Ошибка получения подписки:', error);
      return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
    }
  },

  /**
   * Обменять предмет на подписку
   * POST /items/exchange-for-subscription
   */
  async exchangeItemForSubscription(req, res) {
    try {
      const userId = req.user.id;
      const { itemId, tierId } = req.body;
      // Находим правило обмена
      const rule = await db.ItemSubscriptionExchangeRule.findOne({
        where: { item_id: itemId, subscription_tier_id: parseInt(tierId) },
      });
      if (!rule) return res.status(400).json({ message: 'Нет правила обмена для этого предмета/тарифа' });
      // Проверяем инвентарь
      const inventoryItem = await db.UserInventory.findOne({ where: { userId, itemId } });
      if (!inventoryItem) return res.status(404).json({ message: 'Нет такого предмета для обмена' });
      // Удаляем предмет
      await inventoryItem.destroy();
      // Продлеваем подписку пользователя
      const user = await db.User.findByPk(userId);
      // Если подписка такого же уровня — продлеваем, иначе даём новую
      const now = new Date();
      if (user.subscription_tier === rule.subscription_tier_id && user.subscription_expiry_date && user.subscription_expiry_date > now) {
        user.subscription_expiry_date = new Date(user.subscription_expiry_date.getTime() + rule.days * 86400000);
      } else {
        user.subscription_tier = rule.subscription_tier_id;
        user.subscription_purchase_date = now;
        user.subscription_expiry_date = new Date(now.getTime() + rule.days * 86400000);
      }
      await user.save();
      // Записываем в историю
      await db.SubscriptionHistory.create({
        user_id: userId,
        action: 'exchange_item',
        days: rule.days,
        price: 0,
        item_id: itemId,
        method: 'item',
        date: now
      });
      logger.info(`Пользователь ${userId} обменял предмет ${itemId} на подписку tier=${rule.subscription_tier_id}`);
      return res.json({ success: true, message: `Подписка продлена на ${rule.days} дней` });
    } catch (error) {
      logger.error('Ошибка обмена предмета на подписку:', error);
      return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
    }
  },

  /**
   * Мини-игра "квадраты": сыграть (раз в 48 часов)
   * POST /bonus/play-squares
   */
  async playBonusSquares(req, res) {
    try {
      const userId = req.user.id;
      const user = await db.User.findByPk(userId);
      const now = new Date();
      const ready = !user.next_bonus_available_time || user.next_bonus_available_time <= now;
      if (!ready) return res.status(400).json({ message: 'Бонус пока недоступен', next_time: user.next_bonus_available_time });
      // Пример: два случайных квадрата с наградами из N (напр. 9)
      const totalSquares = 9;
      const prizes = [ 'item', 'balance', null, null, null, null, null, null, null ];
      prizes.sort(() => Math.random() - 0.5); // тасуем призы
      // Выдать только призовые клетки (их обработка зависит от выпадения)
      // Пример: выберем две ячейки для выигрыша
      const wonIndexes = prizes
        .map((val, idx) => ({ val, idx }))
        .filter(({ val }) => !!val)
        .map(({ idx }) => idx);
      // Обработка выигрыша: например, один предмет и 50 на баланс
      let rewardMessage = '';
      if (prizes[wonIndexes[0]] === 'item') {
        // TODO: выдать случайный предмет
        rewardMessage = 'Вам выпал предмет!';
      } else if (prizes[wonIndexes[0]] === 'balance') {
        user.balance = (user.balance || 0) + 50;
        rewardMessage = 'Вам начислено 50 на баланс!';
        await user.save();
      } else {
        rewardMessage = 'Вы ничего не выиграли.';
      }
      // Время до следующего бонуса
      user.next_bonus_available_time = new Date(now.getTime() + 48 * 60 * 60 * 1000); // 48h дальше можно сделать переменным
      user.lifetime_bonuses_claimed = (user.lifetime_bonuses_claimed || 0) + 1;
      user.last_bonus_date = now;
      await user.save();
      // История
      await db.BonusMiniGameHistory.create({
        user_id: userId,
        played_at: now,
        reward: rewardMessage
      });
      return res.json({ message: rewardMessage, next_time: user.next_bonus_available_time });
    } catch (error) {
      logger.error('Ошибка бонус-миниигры:', error);
      return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
    }
  },

  /**
   * Статус бонуса "квадраты"
   * GET /bonus/status
   */
  async getBonusStatus(req, res) {
    try {
      const userId = req.user.id;
      const user = await db.User.findByPk(userId);
      return res.json({
        next_bonus_available_time: user.next_bonus_available_time,
        lifetime_bonuses_claimed: user.lifetime_bonuses_claimed,
        last_bonus_date: user.last_bonus_date,
      });
    } catch (error) {
      logger.error('Ошибка проверки статуса бонуса:', error);
      return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
    }
  },

  /**
   * Узнать, сколько кейсов можно открыть сегодня
   * GET /cases/available
   */
  async getCasesAvailable(req, res) {
    try {
      const userId = req.user.id;
      const user = await db.User.findByPk(userId);
      return res.json({
        max_daily_cases: user.max_daily_cases,
        cases_opened_today: user.cases_opened_today,
        cases_available: Math.max(0, user.max_daily_cases - user.cases_opened_today),
        last_reset_date: user.last_reset_date,
        next_case_available_time: user.next_case_available_time,
      });
    } catch (error) {
      logger.error('Ошибка получения доступных кейсов:', error);
      return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
    }
  },

  /**
   * Прогресс по ачивкам (опционально)
   * GET /achievements/progress
   */
  async getAchievementsProgress(req, res) {
    try {
      const userId = req.user.id;
      const achs = await db.UserAchievement.findAll({
        where: { userId },
        include: [{ model: db.Achievement }]
      });
      const progress = achs.map(entry => ({
        id: entry.achievement_id,
        name: entry.Achievement ? entry.Achievement.name : '',
        description: entry.Achievement ? entry.Achievement.description : '',
        completed: entry.completed,
        progress: entry.progress
      }));
      return res.json({ progress });
    } catch (error) {
      logger.error('Ошибка получения прогресса достижений:', error);
      return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
    }
  },

  // ---- Админ-функции (если нужно) ----

  // Admin update user by ID - update all fields
  async adminUpdateUser(req, res) {
    try {
      const adminUser = req.user;
      if (!adminUser || adminUser.role !== 'admin') {
        return res.status(403).json({ message: 'Доступ запрещён' });
      }

      const userId = req.params.id;
      const updateData = req.body;

      // Не позволяем менять пароль напрямую через этот метод (если нужно, можно добавить отдельный эндпоинт)
      if (updateData.password) {
        delete updateData.password;
      }

      // Обновляем пользователя
      const [updatedRowsCount, [updatedUser]] = await db.User.update(updateData, {
        where: { id: userId },
        returning: true,
        individualHooks: true
      });

      if (updatedRowsCount === 0) {
        return res.status(404).json({ message: 'Пользователь не найден' });
      }

      return res.json({ message: 'Пользователь успешно обновлён', user: updatedUser });
    } catch (error) {
      logger.error('Ошибка обновления пользователя админом:', error);
      return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
    }
  }
};
