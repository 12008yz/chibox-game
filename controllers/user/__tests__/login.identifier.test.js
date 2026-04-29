process.env.JWT_SECRET = process.env.JWT_SECRET || '12345678901234567890123456789012';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || '12345678901234567890123456789012';

const argon2 = require('argon2');
const db = require('../../../models');
const { login } = require('../login');

jest.mock('argon2', () => ({
  verify: jest.fn()
}));

jest.mock('../../../models', () => ({
  User: {
    findOne: jest.fn(),
    findByPk: jest.fn()
  },
  UserAchievement: {},
  Achievement: {},
  UserInventory: {},
  Item: {}
}));

jest.mock('../../../utils/userBonusCalculator', () => ({
  updateUserBonuses: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../../../services/xpService', () => ({
  addExperience: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../../../middleware/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

function createMockRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  res.cookie = jest.fn(() => res);
  return res;
}

function createMockUser() {
  return {
    id: 'user-1',
    email: 'user@example.com',
    username: 'demoUser',
    password: 'hashed',
    role: 'user',
    level: 1,
    xp: 0,
    balance: 0,
    is_email_verified: true,
    reload: jest.fn().mockResolvedValue(undefined),
    save: jest.fn().mockResolvedValue(undefined)
  };
}

describe('login controller identifier support', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('logs in user by username via identifier field', async () => {
    const user = createMockUser();
    db.User.findOne.mockResolvedValue(user);
    db.User.findByPk.mockResolvedValue({ ...user, achievements: [], inventory: [] });
    argon2.verify.mockResolvedValue(true);

    const req = {
      body: { identifier: 'demoUser', password: 'password123' }
    };
    const res = createMockRes();

    await login(req, res);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.cookie).toHaveBeenCalledTimes(2);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      user: expect.objectContaining({ username: 'demoUser' })
    }));
  });
});
