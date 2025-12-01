const fs = require('fs');
const path = require('path');

async function getAvatars(req, res) {
  try {
    const avatarsPath = path.join(__dirname, '../../public/avatars');

    // Проверяем существование папки
    if (!fs.existsSync(avatarsPath)) {
      return res.status(404).json({
        success: false,
        message: 'Папка с аватарами не найдена',
        data: {
          avatars: []
        }
      });
    }

    // Читаем файлы из папки
    const files = fs.readdirSync(avatarsPath);

    // Фильтруем только изображения (jpg, jpeg, png, gif, webp)
    const avatars = files
      .filter(file => {
        const ext = path.extname(file).toLowerCase();
        return ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
      })
      .map(file => ({
        filename: file,
        url: `/avatars/${file}`,
        fullUrl: `${process.env.BASE_URL || 'https://chibox-game.ru'}/avatars/${file}`
      }));

    return res.status(200).json({
      success: true,
      data: {
        avatars
      }
    });
  } catch (error) {
    console.error('❌ Ошибка при получении списка аватаров:', error);
    return res.status(500).json({
      success: false,
      message: 'Не удалось получить список аватаров',
      error: error.message
    });
  }
}

module.exports = getAvatars;
