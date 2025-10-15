const crypto = require('crypto');
require('dotenv').config();

console.log('═══════════════════════════════════════════════════════════════');
console.log('  ROBOKASSA - Информация для технической поддержки');
console.log('═══════════════════════════════════════════════════════════════\n');

// Настройки из .env
const MERCHANT_LOGIN = process.env.ROBOKASSA_MERCHANT_LOGIN || 'Chibox';
const PASSWORD1 = process.env.ROBOKASSA_PASSWORD1 || '';
const PASSWORD2 = process.env.ROBOKASSA_PASSWORD2 || '';
const TEST_MODE = process.env.ROBOKASSA_TEST_MODE === 'true';

console.log('1. КОНФИГУРАЦИЯ');
console.log('─────────────────────────────────────────────────────────────');
console.log('MerchantLogin:', MERCHANT_LOGIN);
console.log('Password1:', PASSWORD1);
console.log('Password2:', PASSWORD2);
console.log('Тестовый режим:', TEST_MODE ? 'ДА (IsTest=1)' : 'НЕТ (IsTest=0)');
console.log('');

// Тестовые параметры платежа
const OutSum = '100.00';
const InvId = 1;
const Description = 'Пополнение баланса: 100 ⚡';

// Custom параметры (Shp_)
const customParams = {
  user_id: '28bc541b-8a88-4208-9d0f-a00ac5664bb2',
  purpose: 'deposit',
  chicoins: '100'
};

console.log('2. ПАРАМЕТРЫ ПЛАТЕЖА');
console.log('─────────────────────────────────────────────────────────────');
console.log('OutSum:', OutSum);
console.log('InvId:', InvId);
console.log('Description:', Description);
console.log('Custom параметры:', JSON.stringify(customParams, null, 2));
console.log('');

// Генерация подписи
console.log('3. ГЕНЕРАЦИЯ ПОДПИСИ (SignatureValue)');
console.log('─────────────────────────────────────────────────────────────');

// Сортируем custom параметры по ключу
const sortedKeys = Object.keys(customParams).sort();
console.log('Отсортированные ключи:', sortedKeys.join(', '));

const sortedParams = sortedKeys
  .map(key => `Shp_${key}=${customParams[key]}`)
  .join(':');

console.log('Отсортированные параметры:', sortedParams);
console.log('');

// Формируем строку для подписи
const signatureString = `${MERCHANT_LOGIN}:${OutSum}:${InvId}:${PASSWORD1}:${sortedParams}`;

console.log('4. СТРОКА ДО ХЕШИРОВАНИЯ (для Robokassa):');
console.log('─────────────────────────────────────────────────────────────');
console.log(signatureString);
console.log('');

// Генерируем MD5 hash
const signatureValue = crypto.createHash('md5').update(signatureString).digest('hex');

console.log('5. SignatureValue ПОСЛЕ MD5 хеширования:');
console.log('─────────────────────────────────────────────────────────────');
console.log(signatureValue);
console.log('');

// Формируем полный URL
console.log('6. ПОЛНЫЙ URL ЗАПРОСА К ROBOKASSA:');
console.log('─────────────────────────────────────────────────────────────');

const params = new URLSearchParams({
  MerchantLogin: MERCHANT_LOGIN,
  OutSum: OutSum,
  InvId: InvId.toString(),
  Description: Description,
  SignatureValue: signatureValue,
  IsTest: TEST_MODE ? '1' : '0',
  Culture: 'ru',
  Encoding: 'utf-8'
});

// Добавляем custom параметры
sortedKeys.forEach(key => {
  params.append(`Shp_${key}`, customParams[key].toString());
});

const paymentUrl = `https://auth.robokassa.ru/Merchant/Index.aspx?${params.toString()}`;
console.log(paymentUrl);
console.log('');

// Разбиваем параметры для читаемости
console.log('7. ПАРАМЕТРЫ URL (для удобства):');
console.log('─────────────────────────────────────────────────────────────');
const allParams = params.toString().split('&');
allParams.forEach(param => {
  console.log('  ' + decodeURIComponent(param));
});
console.log('');

// Информация для копирования
console.log('═══════════════════════════════════════════════════════════════');
console.log('  ДЛЯ ОТПРАВКИ В ТЕХПОДДЕРЖКУ ROBOKASSA:');
console.log('═══════════════════════════════════════════════════════════════\n');

console.log('📋 ТЕЛО ЗАПРОСА (URL):');
console.log(paymentUrl);
console.log('');

console.log('🔑 SignatureValue ДО хеширования:');
console.log(signatureString);
console.log('');

console.log('🔐 SignatureValue ПОСЛЕ MD5 хеширования:');
console.log(signatureValue);
console.log('');

console.log('═══════════════════════════════════════════════════════════════\n');

// Дополнительная информация
console.log('💡 ДОПОЛНИТЕЛЬНАЯ ИНФОРМАЦИЯ:');
console.log('─────────────────────────────────────────────────────────────');
console.log('Алгоритм хеширования: MD5');
console.log('Формат строки для подписи:');
console.log('  MerchantLogin:OutSum:InvId:Password1:Shp_param1=value1:Shp_param2=value2:...');
console.log('');
console.log('Примечание: Custom параметры сортируются по алфавиту ключа.');
console.log('');

// Проверка на наличие паролей
if (!PASSWORD1 || !PASSWORD2) {
  console.log('⚠️  ВНИМАНИЕ: Пароли не установлены в .env файле!');
  console.log('   Проверьте переменные ROBOKASSA_PASSWORD1 и ROBOKASSA_PASSWORD2');
}

console.log('✅ Готово! Скопируйте информацию выше и отправьте в Robokassa.\n');
