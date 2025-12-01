const fs = require('fs');
const path = require('path');

async function getAvatars(req, res) {
  try {
    const avatarsPath = path.join(__dirname, '../../public/avatars');

    // Проверяем существование папки
    if (!fs.existsSync(avatarsPath)) {
      return res.status(404).json({
        message: 'Папка с аватарами не найдена',
        avatars: []
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
        fullUrl: `${process.env.BASE_URL || 'http://localhost:3000'}/avatars/${file}`
      }));

    return res.status(200).json({
      success: true,
      avatars
    });
  } catch (error) {
    console.error('❌ Ошибка при получении списка аватаров:', error);
    return res.status(500).json({
      message: 'Не удалось получить список аватаров',
      error: error.message
    });
  }
}

module.exports = getAvatars;
