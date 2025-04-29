function logout(req, res) {
  // Для JWT logout обрабатывается на клиенте путем удаления токена
  return res.json({ message: 'Успешный выход' });
}

module.exports = {
  logout
};
