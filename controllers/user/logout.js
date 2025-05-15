const { revokedTokens } = require('../../middleware/auth');

function logout(req, res) {
  // Для JWT logout обрабатывается на клиенте путем удаления токена
  // Сервер: добавляем токен в black list (revokedTokens)
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    revokedTokens.add(token);
  }
  return res.json({ message: 'Успешный выход, токен отозван' });
}

module.exports = {
  logout
};
