const db = require('../models');

/**
 * После auth: проверяет, что пользователь является стримером (есть запись в streamers).
 * Прикрепляет req.streamer.
 */
async function requireStreamer(req, res, next) {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ success: false, message: 'Требуется авторизация' });
  }
  const streamer = await db.Streamer.findOne({
    where: { user_id: req.user.id, is_active: true },
    include: [{ model: db.User, as: 'user', attributes: ['id', 'username', 'steam_avatar_url', 'avatar_url'] }]
  });
  if (!streamer) {
    return res.status(403).json({ success: false, message: 'Доступ только для стримеров партнёрской программы' });
  }
  req.streamer = streamer;
  next();
}

module.exports = requireStreamer;
