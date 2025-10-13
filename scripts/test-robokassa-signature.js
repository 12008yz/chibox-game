const crypto = require('crypto');
require('dotenv').config();

// Тестовые данные
const ROBOKASSA_MERCHANT_LOGIN = process.env.ROBOKASSA_MERCHANT_LOGIN || 'Chibox';
const ROBOKASSA_PASSWORD1 = process.env.ROBOKASSA_PASSWORD1 || '';
const ROBOKASSA_PASSWORD2 = process.env.ROBOKASSA_PASSWORD2 || '';
const ROBOKASSA_TEST_MODE = process.env.ROBOKASSA_TEST_MODE === 'true';

console.log('=== Робокасса - Проверка конфигурации ===\n');

console.log('Merchant Login:', ROBOKASSA_MERCHANT_LOGIN);
console.log('Password1 установлен:', ROBOKASSA_PASSWORD1 ? 'ДА' : 'НЕТ');
console.log('Password2 установлен:', ROBOKASSA_PASSWORD2 ? 'ДА' : 'НЕТ');
console.log('Тестовый режим:', ROBOKASSA_TEST_MODE ? 'ДА' : 'НЕТ');

if (!ROBOKASSA_PASSWORD1) {
  console.error('\n❌ ОШИБКА: ROBOKASSA_PASSWORD1 не установлен в .env файле!');
  process.exit(1);
}

console.log('\n=== Тест генерации подписи ===\n');

// Тестовые параметры
const testOutSum = '100.00';
const testInvId = 1;
const testCustomParams = {
  amount_in_rubles: '100',
  chicoins: '100',
  display_amount: '100',
  display_currency: 'RUB',
  exchange_rate: '1',
  purpose: 'deposit',
  type: 'balance_topup',
  userId: '28bc541b-8a88-4208-9d0f-a00ac5664bb2',
  user_id: '28bc541b-8a88-4208-9d0f-a00ac5664bb2'
};

// Сортируем параметры по алфавиту
const sortedKeys = Object.keys(testCustomParams).sort();
console.log('Отсортированные ключи:', sortedKeys);

// Формируем строку с параметрами
const sortedParams = sortedKeys
  .map(key => `Shp_${key}=${testCustomParams[key]}`)
  .join(':');

console.log('\nОтсортированные параметры:');
console.log(sortedParams);

// Формируем строку для подписи
const signatureString = `${ROBOKASSA_MERCHANT_LOGIN}:${testOutSum}:${testInvId}:${ROBOKASSA_PASSWORD1}:${sortedParams}`;

console.log('\n=== Строка для подписи ===');
console.log(signatureString);

// Генерируем подпись
const signature = crypto.createHash('md5').update(signatureString).digest('hex');

console.log('\n=== Результат ===');
console.log('MD5 подпись:', signature);

// Формируем тестовый URL
const params = new URLSearchParams({
  MerchantLogin: ROBOKASSA_MERCHANT_LOGIN,
  OutSum: testOutSum,
  InvId: testInvId.toString(),
  Description: 'Пополнение баланса: 100 ⚡',
  SignatureValue: signature,
  IsTest: ROBOKASSA_TEST_MODE ? '1' : '0',
  Culture: 'ru',
  Encoding: 'utf-8'
});

// Добавляем custom параметры
sortedKeys.forEach(key => {
  params.append(`Shp_${key}`, testCustomParams[key].toString());
});

const paymentUrl = `https://auth.robokassa.ru/Merchant/Index.aspx?${params.toString()}`;

console.log('\n=== Тестовый URL для оплаты ===');
console.log(paymentUrl);

console.log('\n✅ Скопируйте этот URL и откройте в браузере для проверки');
console.log('\nЕсли всё настроено правильно, вы увидите страницу оплаты Робокассы');
console.log('Если увидите ошибку 26 - проверьте пароли в личном кабинете Робокассы\n');
