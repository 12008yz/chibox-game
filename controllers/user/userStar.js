const db = require('../../models');

async function starUser(req, res) {
  try {
    const targetId = req.params.id;
    const stargazerId = req.user.id;

    if (String(targetId) === String(stargazerId)) {
      return res.status(400).json({ message: 'Нельзя поставить звезду самому себе' });
    }

    const target = await db.User.findByPk(targetId, { attributes: ['id'] });
    if (!target) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    await db.UserStar.findOrCreate({
      where: { starred_user_id: targetId, stargazer_id: stargazerId },
      defaults: { starred_user_id: targetId, stargazer_id: stargazerId },
    });

    const starsCount = await db.UserStar.count({ where: { starred_user_id: targetId } });
    return res.json({ starsCount, starred: true });
  } catch (error) {
    console.error('starUser:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

async function unstarUser(req, res) {
  try {
    const targetId = req.params.id;
    const stargazerId = req.user.id;

    if (String(targetId) === String(stargazerId)) {
      return res.status(400).json({ message: 'Нельзя снять звезду с самого себя' });
    }

    const target = await db.User.findByPk(targetId, { attributes: ['id'] });
    if (!target) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    await db.UserStar.destroy({
      where: { starred_user_id: targetId, stargazer_id: stargazerId },
    });

    const starsCount = await db.UserStar.count({ where: { starred_user_id: targetId } });
    return res.json({ starsCount, starred: false });
  } catch (error) {
    console.error('unstarUser:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = { starUser, unstarUser };
