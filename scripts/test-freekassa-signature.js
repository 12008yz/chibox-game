require('dotenv').config();
const crypto = require('crypto');

console.log('\n═══════════════════════════════════════════════════════════');
console.log('  FREEKASSA - Информация для технической поддержки');
console.log('═══════════════════════════════════════════════════════════\n');

// Получаем данные из .env
const MERCHANT_ID = process.env.FREEKASSA_MERCHANT_ID || '';
const SECRET_WORD_1 = process.env.FREEKASSA_SECRET_WORD_1 || '';
const SECRET_WORD_2 = process.env.FREEKASSA_SECRET_WORD_2 || '';
const API_KEY = process.env.FREEKASSA_API_KEY || '';

console.log('1. НАСТРОЙКИ ИЗ .ENV:');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`   FREEKASSA_MERCHANT_ID: ${MERCHANT_ID || '❌ НЕ УСТАНОВЛЕН'}`);
console.log(`   FREEKASSA_SECRET_WORD_1: ${SECRET_WORD_1 ? '✓ Установлен (' + SECRET_WORD_1.length + ' символов)' : '❌ НЕ УСТАНОВЛЕН'}`);
console.log(`   FREEKASSA_SECRET_WORD_2: ${SECRET_WORD_2 ? '✓ Установлен (' + SECRET_WORD_2.length + ' символов)' : '❌ НЕ УСТАНОВЛЕН'}`);
console.log(`   FREEKASSA_API_KEY: ${API_KEY ? '✓ Установлен (' + API_KEY.length + ' символов)' : '⚠ НЕ УСТАНОВЛЕН (опционально)'}`);

if (!MERCHANT_ID || !SECRET_WORD_1 || !SECRET_WORD_2) {
  console.log('\n❌ ОШИБКА: Не все обязательные переменные установлены!');
  console.log('   Создайте файл .env в папке backend/ со следующими переменными:');
  console.log('   FREEKASSA_MERCHANT_ID=ваш_ID_магазина');
  console.log('   FREEKASSA_SECRET_WORD_1=ваше_секретное_слово_1');
  console.log('   FREEKASSA_SECRET_WORD_2=ваше_секретное_слово_2');
  console.log('   FREEKASSA_API_KEY=ваш_API_ключ\n');
  process.exit(1);
}

// Тестовые данные для платежа
const testAmount = '100.00';
const testOrderId = 12345;

console.log('\n2. ТЕСТОВЫЕ ДАННЫЕ ПЛАТЕЖА:');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`   Сумма платежа: ${testAmount} RUB`);
console.log(`   Номер заказа (InvoiceNumber): ${testOrderId}`);

// Генерация подписи для создания платежа (SECRET_WORD_1)
console.log('\n3. ПОДПИСЬ ДЛЯ СОЗДАНИЯ ПЛАТЕЖА (используется SECRET_WORD_1):');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
const signatureString1 = `${MERCHANT_ID}:${testAmount}:${SECRET_WORD_1}:${testOrderId}`;
console.log(`   Формула: shop_id:amount:secret:order_id`);
console.log(`   Строка до хеширования: ${signatureString1}`);
const signature1 = crypto.createHash('md5').update(signatureString1).digest('hex');
console.log(`   MD5 подпись: ${signature1}`);

// Генерация URL для оплаты
console.log('\n4. ПОЛНЫЙ URL ДЛЯ ОПЛАТЫ:');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
const paymentParams = new URLSearchParams({
  m: MERCHANT_ID,
  oa: testAmount,
  o: testOrderId.toString(),
  s: signature1,
  currency: 'RUB',
  lang: 'ru',
  us_user_id: '1',
  us_purpose: 'deposit',
  us_chicoins: testAmount
});

const paymentUrl = `https://pay.freekassa.ru/?${paymentParams.toString()}`;
console.log(`   ${paymentUrl}`);

// Симуляция вебхука (Result URL) с SECRET_WORD_2
console.log('\n5. ПРОВЕРКА ПОДПИСИ ВЕБХУКА (Result URL, используется SECRET_WORD_2):');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
const webhookAmount = testAmount;
const webhookOrderId = testOrderId;
const signatureString2 = `${MERCHANT_ID}:${webhookAmount}:${SECRET_WORD_2}:${webhookOrderId}`;
console.log(`   Формула: shop_id:amount:secret:order_id`);
console.log(`   Строка до хеширования: ${signatureString2}`);
const webhookSignature = crypto.createHash('md5').update(signatureString2).digest('hex');
console.log(`   MD5 подпись от FREEKASSA (ожидается): ${webhookSignature}`);

console.log('\n6. ПАРАМЕТРЫ ВЕБХУКА (что придет от FREEKASSA):');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`   MERCHANT_ID=${MERCHANT_ID}`);
console.log(`   AMOUNT=${webhookAmount}`);
console.log(`   MERCHANT_ORDER_ID=${webhookOrderId}`);
console.log(`   SIGN=${webhookSignature}`);
console.log(`   intid=123456 (ID транзакции в FREEKASSA)`);

console.log('\n7. URL ДЛЯ НАСТРОЙКИ В ЛИЧНОМ КАБИНЕТЕ FREEKASSA:');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('   Result URL:  https://chibox-game.ru/api/payments/freekassa/result');
console.log('   Success URL: https://chibox-game.ru/api/payments/freekassa/success');
console.log('   Fail URL:    https://chibox-game.ru/api/payments/freekassa/fail');

console.log('\n8. ПРОВЕРКА ЛОГИКИ В КОДЕ:');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// Тест функции из freekassaService
const { generateSignature, verifySignature } = require('../services/freekassaService');

const testSig = generateSignature(MERCHANT_ID, testAmount, SECRET_WORD_1, testOrderId);
console.log(`   generateSignature() результат: ${testSig}`);
console.log(`   Совпадает с ожидаемым: ${testSig === signature1 ? '✓ ДА' : '✗ НЕТ'}`);

const isValid = verifySignature(MERCHANT_ID, parseFloat(testAmount), SECRET_WORD_2, testOrderId, webhookSignature);
console.log(`   verifySignature() результат: ${isValid ? '✓ ВАЛИДНА' : '✗ НЕ ВАЛИДНА'}`);

console.log('\n9. ЧТО ДЕЛАТЬ ПРИ ОШИБКЕ 400:');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('   ① Проверьте, что MERCHANT_ID совпадает с Shop ID в личном кабинете');
console.log('   ② Проверьте, что SECRET_WORD_1 точно совпадает с Секретным словом 1');
console.log('   ③ Убедитесь, что сумма передается в формате X.XX (две цифры после точки)');
console.log('   ④ Проверьте, что нет лишних пробелов в ключах из .env');
console.log('   ⑤ В FREEKASSA проверьте, что магазин активирован и не в тестовом режиме');

console.log('\n10. ДЛЯ ОТПРАВКИ В ТЕХПОДДЕРЖКУ FREEKASSA:');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`   Shop ID: ${MERCHANT_ID}`);
console.log(`   Строка подписи: ${signatureString1}`);
console.log(`   MD5 хеш: ${signature1}`);
console.log(`   URL платежа: ${paymentUrl.substring(0, 100)}...`);
console.log(`   Ошибка: HTTP 400 Bad Request при создании платежа`);

console.log('\n✅ Скопируйте информацию выше для отладки или техподдержки.\n');
