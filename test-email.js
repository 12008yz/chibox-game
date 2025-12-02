require('dotenv').config();
const emailService = require('./services/emailService');

async function testEmail() {
  try {
    const code = emailService.generateVerificationCode();
    console.log('📧 Отправляем тестовый email с кодом:', code);
    
    const result = await emailService.sendVerificationEmail(
      'ruffery123@mail.ru',  // ваш email для теста
      code,
      'Тестовый пользователь'
    );
    
    console.log('✅ Email отправлен успешно:', result);
  } catch (error) {
    console.error('❌ Ошибка:', error.message);
  }
  process.exit(0);
}

testEmail();
