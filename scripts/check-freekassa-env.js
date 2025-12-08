require('dotenv').config();
const crypto = require('crypto');

console.log('\n🔍 ДЕТАЛЬНАЯ ПРОВЕРКА ПЕРЕМЕННЫХ FREEKASSA\n');
console.log('═══════════════════════════════════════════════════════════\n');

// Получаем переменные
const MERCHANT_ID = process.env.FREEKASSA_MERCHANT_ID;
const SECRET_WORD_1 = process.env.FREEKASSA_SECRET_WORD_1;
const SECRET_WORD_2 = process.env.FREEKASSA_SECRET_WORD_2;
const API_KEY = process.env.FREEKASSA_API_KEY;

console.log('1️⃣  ПРОВЕРКА НАЛИЧИЯ ПЕРЕМЕННЫХ:');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`   FREEKASSA_MERCHANT_ID: ${MERCHANT_ID ? '✅ Есть' : '❌ ОТСУТСТВУЕТ'}`);
console.log(`   FREEKASSA_SECRET_WORD_1: ${SECRET_WORD_1 ? '✅ Есть' : '❌ ОТСУТСТВУЕТ'}`);
console.log(`   FREEKASSA_SECRET_WORD_2: ${SECRET_WORD_2 ? '✅ Есть' : '❌ ОТСУТСТВУЕТ'}`);
console.log(`   FREEKASSA_API_KEY: ${API_KEY ? '✅ Есть' : '⚠️  ОТСУТСТВУЕТ (опционально)'}`);

if (!MERCHANT_ID || !SECRET_WORD_1 || !SECRET_WORD_2) {
  console.log('\n❌ КРИТИЧЕСКАЯ ОШИБКА: Не все обязательные переменные установлены!\n');
  process.exit(1);
}

console.log('\n2️⃣  ПРОВЕРКА ЗНАЧЕНИЙ:');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`   MERCHANT_ID = "${MERCHANT_ID}"`);
console.log(`   Длина: ${MERCHANT_ID.length} символов`);
console.log(`   SECRET_WORD_1 = "${SECRET_WORD_1}"`);
console.log(`   Длина: ${SECRET_WORD_1.length} символов`);
console.log(`   SECRET_WORD_2 = "${SECRET_WORD_2}"`);
console.log(`   Длина: ${SECRET_WORD_2.length} символов`);

console.log('\n3️⃣  ПРОВЕРКА НА НЕВИДИМЫЕ СИМВОЛЫ:');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

function checkInvisibleChars(str, name) {
  const hasLeadingSpace = str !== str.trimStart();
  const hasTrailingSpace = str !== str.trimEnd();
  const hasLineBreak = /[\r\n]/.test(str);
  const hasTabs = /\t/.test(str);

  if (hasLeadingSpace) console.log(`   ⚠️  ${name}: Найдены ПРОБЕЛЫ В НАЧАЛЕ!`);
  if (hasTrailingSpace) console.log(`   ⚠️  ${name}: Найдены ПРОБЕЛЫ В КОНЦЕ!`);
  if (hasLineBreak) console.log(`   ⚠️  ${name}: Найдены ПЕРЕНОСЫ СТРОК!`);
  if (hasTabs) console.log(`   ⚠️  ${name}: Найдены ТАБУЛЯЦИИ!`);

  if (!hasLeadingSpace && !hasTrailingSpace && !hasLineBreak && !hasTabs) {
    console.log(`   ✅ ${name}: Чисто, невидимых символов нет`);
  }

  return {
    clean: !hasLeadingSpace && !hasTrailingSpace && !hasLineBreak && !hasTabs,
    trimmed: str.trim()
  };
}

const merchantCheck = checkInvisibleChars(MERCHANT_ID, 'MERCHANT_ID');
const secret1Check = checkInvisibleChars(SECRET_WORD_1, 'SECRET_WORD_1');
const secret2Check = checkInvisibleChars(SECRET_WORD_2, 'SECRET_WORD_2');

console.log('\n4️⃣  ТЕСТ ПОДПИСИ (с тестовыми данными):');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const testAmount = '100.00';
const testOrderId = 12345;

// Используем очищенные значения
const cleanMerchantId = merchantCheck.trimmed;
const cleanSecret1 = secret1Check.trimmed;
const cleanSecret2 = secret2Check.trimmed;

console.log(`   Тестовая сумма: ${testAmount} RUB`);
console.log(`   Тестовый Order ID: ${testOrderId}`);

// Генерация подписи для создания платежа
const signatureString1 = `${cleanMerchantId}:${testAmount}:${cleanSecret1}:${testOrderId}`;
console.log(`\n   📝 Строка для подписи (создание):`);
console.log(`   "${signatureString1}"`);

const signature1 = crypto.createHash('md5').update(signatureString1).digest('hex');
console.log(`   🔐 MD5 подпись: ${signature1}`);

// Генерация подписи для вебхука
const signatureString2 = `${cleanMerchantId}:${testAmount}:${cleanSecret2}:${testOrderId}`;
console.log(`\n   📝 Строка для подписи (вебхук):`);
console.log(`   "${signatureString2}"`);

const signature2 = crypto.createHash('md5').update(signatureString2).digest('hex');
console.log(`   🔐 MD5 подпись: ${signature2}`);

console.log('\n5️⃣  СРАВНЕНИЕ SECRET_WORD_1 и SECRET_WORD_2:');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
if (cleanSecret1 === cleanSecret2) {
  console.log(`   ✅ Секретные слова ОДИНАКОВЫЕ (это нормально для вашего случая)`);
  console.log(`   ℹ️  Обе подписи будут: ${signature1}`);
} else {
  console.log(`   ⚠️  Секретные слова РАЗНЫЕ:`);
  console.log(`   SECRET_WORD_1: "${cleanSecret1}"`);
  console.log(`   SECRET_WORD_2: "${cleanSecret2}"`);
  console.log(`   Подпись создания: ${signature1}`);
  console.log(`   Подпись вебхука: ${signature2}`);
}

console.log('\n6️⃣  ПРИМЕР URL ДЛЯ ТЕСТОВОГО ПЛАТЕЖА:');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const testUrl = `https://pay.fk.money/?m=${cleanMerchantId}&oa=${testAmount}&o=${testOrderId}&s=${signature1}&currency=RUB&lang=ru`;
console.log(`   ${testUrl}`);

console.log('\n7️⃣  ЧТО ПРОВЕРИТЬ В ЛИЧНОМ КАБИНЕТЕ FREEKASSA:');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`   ① Shop ID должен быть: ${cleanMerchantId}`);
console.log(`   ② Секретное слово 1 должно быть: ${cleanSecret1}`);
console.log(`   ③ Секретное слово 2 должно быть: ${cleanSecret2}`);
console.log(`   ④ Магазин должен быть АКТИВИРОВАН`);
console.log(`   ⑤ Проверьте, что НЕТ IP-ограничений`);
console.log(`   ⑥ Убедитесь, что выбран правильный режим (боевой/тест)`);

console.log('\n8️⃣  ВОЗМОЖНЫЕ ПРИЧИНЫ ОШИБКИ 400:');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`   • Неверный Shop ID в личном кабинете FreeKassa`);
console.log(`   • Неверное Секретное слово 1`);
console.log(`   • Магазин не активирован или заблокирован`);
console.log(`   • IP-адрес вашего сервера не в белом списке`);
console.log(`   • Минимальная сумма платежа не соблюдена`);
console.log(`   • В настройках магазина отключена валюта RUB`);

console.log('\n9️⃣  РЕКОМЕНДАЦИИ:');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

if (!merchantCheck.clean || !secret1Check.clean || !secret2Check.clean) {
  console.log(`   ⚠️  ОБНАРУЖЕНЫ НЕВИДИМЫЕ СИМВОЛЫ!`);
  console.log(`   Исправьте файл .env, убрав все пробелы вокруг значений:`);
  console.log(`   `);
  console.log(`   FREEKASSA_MERCHANT_ID=${cleanMerchantId}`);
  console.log(`   FREEKASSA_SECRET_WORD_1=${cleanSecret1}`);
  console.log(`   FREEKASSA_SECRET_WORD_2=${cleanSecret2}`);
} else {
  console.log(`   ✅ Все переменные в .env настроены правильно`);
  console.log(`   ✅ Невидимых символов не обнаружено`);
  console.log(`   ℹ️  Если ошибка всё ещё есть, проблема на стороне FreeKassa:`);
  console.log(`      • Проверьте личный кабинет`);
  console.log(`      • Свяжитесь с тех. поддержкой FreeKassa`);
  console.log(`      • Покажите им этот MD5 хеш: ${signature1}`);
}

console.log('\n✅ Проверка завершена!\n');
