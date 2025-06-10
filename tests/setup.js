const path = require('path');
const dotenv = require('dotenv');

// Загружаем тестовую конфигурацию
dotenv.config({ path: path.join(__dirname, '..', '.env.test') });

// Увеличиваем timeout для Jest
jest.setTimeout(30000);

// Мокаем внешние сервисы
jest.mock('../services/steamBotService', () => ({
  sendTradeOffer: jest.fn().mockResolvedValue({ success: true, tradeOfferId: 'test_trade_id' }),
  getInventory: jest.fn().mockResolvedValue([]),
  isOnline: jest.fn().mockReturnValue(true)
}));

jest.mock('../services/paymentService', () => ({
  createPayment: jest.fn().mockResolvedValue({
    id: 'test_payment_id',
    confirmation: { confirmation_url: 'http://test.com' }
  }),
  verifyWebhook: jest.fn().mockReturnValue(true)
}));

// Мокаем логгер для тестов
jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));

// Мокаем Redis
jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    connect: jest.fn().mockResolvedValue(),
    disconnect: jest.fn().mockResolvedValue(),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    exists: jest.fn().mockResolvedValue(0),
    expire: jest.fn().mockResolvedValue(1),
    flushDb: jest.fn().mockResolvedValue('OK'),
    on: jest.fn(),
    off: jest.fn()
  }))
}));

console.log('Test setup completed');
