const db = require('../../models');
const winston = require('winston');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

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

// Настройка хранилища для multer
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../../public/avatars');
    try {
      await fs.mkdir(uploadPath, { recursive: true });
      cb(null, uploadPath);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `avatar-${req.user.id}-${uniqueSuffix}${ext}`);
  }
});

// Фильтр для проверки типа файла
const fileFilter = (req, file, cb) => {
  const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Недопустимый формат файла. Разрешены только JPEG, PNG, GIF и WEBP.'), false);
  }
};

// Настройка multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB максимум
  }
});

// Middleware для загрузки аватара
const uploadMiddleware = upload.single('avatar');

// Контроллер для обработки загрузки аватара
async function uploadAvatar(req, res) {
  try {
    const userId = req.user.id;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Файл не был загружен'
      });
    }

    const user = await db.User.findByPk(userId);
    if (!user) {
      // Удаляем загруженный файл если пользователь не найден
      await fs.unlink(req.file.path);
      return res.status(404).json({
        success: false,
        message: 'Пользователь не найден'
      });
    }

    // Удаляем старый аватар если он существует
    if (user.avatar_url) {
      try {
        const oldAvatarPath = path.join(__dirname, '../../public', user.avatar_url.replace(/^\//, ''));
        await fs.unlink(oldAvatarPath);
      } catch (error) {
        logger.warn(`Не удалось удалить старый аватар: ${error.message}`);
      }
    }

    // Сохраняем путь к новому аватару
    const avatarUrl = `/avatars/${req.file.filename}`;
    user.avatar_url = avatarUrl;
    await user.save();

    // Создание уведомления
    await db.Notification.create({
      user_id: userId,
      title: 'Аватар обновлен',
      message: 'Ваш аватар профиля был успешно обновлен.',
      type: 'success',
      category: 'general',
      importance: 5
    });

    logger.info(`Аватар пользователя обновлен: ${user.email}`);

    return res.json({
      success: true,
      message: 'Аватар успешно загружен',
      data: {
        avatar_url: avatarUrl
      }
    });

  } catch (error) {
    logger.error('Ошибка при загрузке аватара:', error);

    // Удаляем загруженный файл в случае ошибки
    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        logger.error('Ошибка при удалении файла:', unlinkError);
      }
    }

    return res.status(500).json({
      success: false,
      message: 'Ошибка при загрузке аватара',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

// Контроллер для удаления аватара
async function deleteAvatar(req, res) {
  try {
    const userId = req.user.id;

    const user = await db.User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Пользователь не найден'
      });
    }

    if (!user.avatar_url) {
      return res.status(400).json({
        success: false,
        message: 'У пользователя нет загруженного аватара'
      });
    }

    // Удаляем файл аватара
    try {
      const avatarPath = path.join(__dirname, '../../public', user.avatar_url.replace(/^\//, ''));
      await fs.unlink(avatarPath);
    } catch (error) {
      logger.warn(`Не удалось удалить файл аватара: ${error.message}`);
    }

    // Удаляем ссылку на аватар из БД
    user.avatar_url = null;
    await user.save();

    // Создание уведомления
    await db.Notification.create({
      user_id: userId,
      title: 'Аватар удален',
      message: 'Ваш пользовательский аватар был удален.',
      type: 'info',
      category: 'general',
      importance: 5
    });

    logger.info(`Аватар пользователя удален: ${user.email}`);

    return res.json({
      success: true,
      message: 'Аватар успешно удален'
    });

  } catch (error) {
    logger.error('Ошибка при удалении аватара:', error);
    return res.status(500).json({
      success: false,
      message: 'Ошибка при удалении аватара',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

module.exports = {
  uploadAvatar,
  deleteAvatar,
  uploadMiddleware
};
