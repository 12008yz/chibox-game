const express = require('express');
const request = require('supertest');
const { initTestDatabase } = require('./testUtils');

let app;
let server;

/**
 * Создание тестового приложения
 */
async function createTestApp() {
  if (app) {
    return app;
  }

  // Инициализируем тестовую базу данных
  await initTestDatabase();

  // Создаем Express приложение
  app = express();

  // Подключаем middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  // Подключаем маршруты
  const userRoutes = require('../../routes/userRoutes');
  const paymentRoutes = require('../../routes/paymentRoutes');

  app.use('/api/user', userRoutes);
  app.use('/api/payment', paymentRoutes);

  // Обработка ошибок
  app.use((err, req, res, next) => {
    res.status(err.status || 500).json({
      success: false,
      message: err.message || 'Internal server error',
      error: process.env.NODE_ENV === 'test' ? err : {}
    });
  });

  return app;
}

/**
 * Запуск тестового сервера
 */
async function startTestServer(port = 3001) {
  if (server) {
    return server;
  }

  const testApp = await createTestApp();

  return new Promise((resolve, reject) => {
    server = testApp.listen(port, (err) => {
      if (err) {
        reject(err);
      } else {
        console.log(`Test server running on port ${port}`);
        resolve(server);
      }
    });
  });
}

/**
 * Остановка тестового сервера
 */
async function stopTestServer() {
  if (server) {
    return new Promise((resolve) => {
      server.close(() => {
        server = null;
        app = null;
        console.log('Test server stopped');
        resolve();
      });
    });
  }
}

/**
 * Создание supertest агента
 */
function createAgent() {
  if (!app) {
    throw new Error('Test app is not initialized. Call createTestApp() first.');
  }
  return request(app);
}

module.exports = {
  createTestApp,
  startTestServer,
  stopTestServer,
  createAgent
};
