const db = require('../../models');

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 80;

/**
 * История общего чата (публично, для подгрузки при открытии страницы).
 */
async function getGlobalChatHistory(req, res) {
  try {
    const rawLimit = parseInt(req.query.limit, 10);
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, Number.isFinite(rawLimit) ? rawLimit : DEFAULT_LIMIT)
    );

    const rows = await db.GlobalChatMessage.findAll({
      include: [
        {
          model: db.User,
          as: 'author',
          attributes: ['id', 'username', 'level'],
          required: true,
        },
      ],
      order: [['created_at', 'DESC']],
      limit,
    });

    const chronological = rows.reverse();
    const messages = chronological.map((row) => ({
      id: row.id,
      userId: row.user_id,
      username: row.author?.username || '—',
      level: row.author?.level ?? 1,
      body: row.body,
      createdAt: row.createdAt ? row.createdAt.toISOString() : new Date().toISOString(),
    }));

    return res.json({ success: true, messages });
  } catch (error) {
    console.error('getGlobalChatHistory:', error);
    return res.status(500).json({ success: false, message: 'Не удалось загрузить чат' });
  }
}

module.exports = { getGlobalChatHistory };
