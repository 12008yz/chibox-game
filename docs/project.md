# ChiBox Game - Система вывода предметов CS2

Этот документ содержит инструкции по настройке и запуску системы автоматизированного вывода предметов из инвентаря сайта в инвентарь Steam пользователя через BUFF.

## Содержание

1. [Общая архитектура](#общая-архитектура)
2. [Настройка BUFF](#настройка-buff)
3. [Настройка Steam бота](#настройка-steam-бота)
4. [Запуск сервисов](#запуск-сервисов)
5. [Мониторинг и обслуживание](#мониторинг-и-обслуживание)
6. [Устранение неполадок](#устранение-неполадок)
7. [API для вывода предметов](#api-для-вывода-предметов)

## Общая архитектура

Система вывода предметов состоит из следующих компонентов:

- **Веб-сервер приложения** - обрабатывает запросы пользователей, создает заявки на вывод
- **База данных** - хранит информацию о пользователях, предметах, инвентаре и заявках
- **Steam бот** - взаимодействует с Steam API, отправляет трейды пользователям
- **BUFF сервис** - авторизуется на BUFF, ищет и покупает предметы для вывода
- **Процессор выводов** - регулярно обрабатывает заявки на вывод

Процесс вывода предмета:
1. Пользователь запрашивает вывод предмета из своего инвентаря
2. Система создает заявку на вывод со статусом "pending"
3. Процессор выводов проверяет наличие предмета в инвентаре бота
4. Если предмет есть - отправляет его пользователю через трейд
5. Если предмета нет - покупает его на BUFF, дожидается доставки в инвентарь бота и затем отправляет пользователю

## Настройка BUFF

### 1. Получение данных авторизации

Для работы с BUFF необходимо получить cookies и CSRF-токен:

1. Войдите в аккаунт BUFF в браузере (https://buff.163.com/)
2. Откройте инструменты разработчика (F12)
3. Перейдите на вкладку "Application" (Chrome) или "Storage" (Firefox)
4. В левой панели выберите "Cookies" → "https://buff.163.com"
5. Скопируйте значения всех куки
6. Найдите CSRF-токен в мета-теге страницы (в исходном коде)

### 2. Настройка конфигурации BUFF

Файл конфигурации находится в `config/buff_config.json`:

```json
{
  "cookies": "Device-Id=xxx; Locale-Supported=ru; P_INFO=xxx; csrf_token=xxx; game=csgo; remember_me=xxx; session=xxx",
  "csrfToken": "xxx",
  "sessionId": "xxx",
  "lastUpdated": "2025-05-19T16:45:00.000Z"
}
```

### 3. Проверка конфигурации

Выполните тестовый скрипт для проверки подключения к BUFF:

```bash
node scripts/test-buff-config.js
```

### 4. Обновление конфигурации

Cookies имеют ограниченный срок действия (обычно несколько дней). При их истечении необходимо:
1. Повторно войти в BUFF
2. Получить новые cookies и CSRF-токен
3. Обновить файл `config/buff_config.json`

## Настройка Steam бота

### 1. Учетные данные Steam

Данные для Steam бота хранятся в файле `controllers/user/steamBotController.js`:

```javascript
const botAccountName = 'account_name';
const botPassword = 'password';
const botSharedSecret = 'shared_secret';
const botIdentitySecret = 'identity_secret';
```

Для получения shared_secret и identity_secret можно использовать SDA (Steam Desktop Authenticator).

### 2. Авторизация Steam бота

Для ручной авторизации бота используйте:

```bash
node controllers/user/steamBotController.js login
```

Или через API:

```
POST /api/steam-bot/login
```

### 3. Проверка инвентаря бота

Вы можете проверить инвентарь бота через API:

```
GET /api/steam-bot/inventory
```

## Запуск сервисов

### 1. Запуск основного сервера

```bash
node app.js
```

Или с использованием PM2:

```bash
pm2 start ecosystem.config.js
```

### 2. Запуск процессора выводов

```bash
node scripts/withdrawalProcessor.js
```

Для автоматического запуска по расписанию, настройте cron-задачу:

```bash
# Запуск процессора выводов каждые 10 минут
*/10 * * * * cd /путь/к/проекту && node scripts/withdrawalProcessor.js
```

### 3. Настройка автозапуска с PM2

Файл конфигурации `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [
    {
      name: "main-app",
      script: "app.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production"
      }
    },
    {
      name: "withdrawal-processor",
      script: "scripts/withdrawalProcessor.js",
      instances: 1,
      autorestart: true,
      watch: false,
      cron_restart: "*/10 * * * *", // restart every 10 minutes
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
```

Запуск всех сервисов:

```bash
pm2 start ecosystem.config.js
```

## Мониторинг и обслуживание

### 1. Проверка логов

```bash
# Логи основного приложения
pm2 logs main-app

# Логи процессора выводов
pm2 logs withdrawal-processor

# Специфические логи
tail -f logs/withdrawal-service.log
tail -f logs/steam-bot.log
tail -f logs/buff-service.log
```

### 2. Обслуживание базы данных

Регулярно проверяйте состояние заявок на вывод:

```sql
-- Проверка зависших заявок
SELECT id, status, request_date, processing_attempts
FROM withdrawals
WHERE status IN ('processing', 'waiting_confirmation')
AND updated_at < NOW() - INTERVAL '24 HOURS';

-- Статистика заявок
SELECT status, COUNT(*)
FROM withdrawals
GROUP BY status;
```

### 3. Управление зависшими заявками

Скрипт для сброса зависших заявок:

```bash
node scripts/reset-stuck-withdrawals.js
```

## Устранение неполадок

### 1. Проблемы с авторизацией BUFF

- **Проблема**: Ошибка "Не удалось авторизоваться на BUFF"
- **Решение**: Обновите cookies и CSRF-токен в `config/buff_config.json`

### 2. Проблемы с авторизацией Steam

- **Проблема**: Бот не может войти в Steam
- **Решение**: Проверьте учетные данные и Mobile Authenticator. Возможно, требуется подтверждение входа.

### 3. Ошибки при покупке предметов

- **Проблема**: "Ошибка покупки предмета на BUFF"
- **Решения**:
  - Проверьте баланс на BUFF
  - Проверьте доступность предмета
  - Проверьте правильность данных авторизации

### 4. Ошибки при отправке трейдов

- **Проблема**: "Failed to send trade offer"
- **Решения**:
  - Проверьте, нет ли ограничений на трейды у бота
  - Проверьте правильность Trade URL пользователя
  - Убедитесь, что предмет доступен для обмена (не имеет trade hold)

## API для вывода предметов

### 1. Создание заявки на вывод

```
POST /api/user/withdraw-item
Content-Type: application/json
Authorization: Bearer YOUR_AUTH_TOKEN

{
  "itemId": "uuid-предмета-из-инвентаря",
  "steamTradeUrl": "https://steamcommunity.com/tradeoffer/new/?partner=YOUR_PARTNER_ID&token=YOUR_TRADE_TOKEN"
}
```

**Ответ:**
```json
{
  "success": true,
  "message": "Заявка на вывод предмета создана успешно",
  "data": {
    "withdrawal_id": "uuid-заявки-на-вывод",
    "status": "pending",
    "created_at": "2025-05-19T12:34:56.789Z"
  }
}
```

### 2. Проверка статуса заявки

```
GET /api/user/withdrawal-status/{withdrawalId}
Authorization: Bearer YOUR_AUTH_TOKEN
```

**Ответ:**
```json
{
  "success": true,
  "data": {
    "id": "uuid-заявки-на-вывод",
    "status": "waiting_confirmation",
    "created_at": "2025-05-19T12:34:56.789Z",
    "processing_date": "2025-05-19T12:35:10.123Z",
    "steam_trade_offer_id": "1234567890",
    "steam_trade_status": "sent",
    "items": [
      {
        "id": "uuid-предмета",
        "name": "AK-47 | Redline",
        "market_hash_name": "AK-47 | Redline (Field-Tested)",
        "exterior": "Field-Tested",
        "price": 35.75
      }
    ]
  }
}
```

### 3. Получение инвентаря пользователя

```
GET /api/user/inventory
Authorization: Bearer YOUR_AUTH_TOKEN
```

---

## Дополнительные скрипты

### 1. Скрипт для сброса зависших заявок

```javascript
// scripts/reset-stuck-withdrawals.js
const db = require('../models');
const { Op } = require('sequelize');

async function resetStuckWithdrawals() {
  const stuckWithdrawals = await db.Withdrawal.findAll({
    where: {
      status: {
        [Op.in]: ['processing', 'waiting_confirmation']
      },
      updatedAt: {
        [Op.lt]: new Date(Date.now() - 24 * 60 * 60 * 1000) // older than 24 hours
      }
    }
  });

  console.log(`Found ${stuckWithdrawals.length} stuck withdrawals`);

  for (const withdrawal of stuckWithdrawals) {
    await withdrawal.update({
      status: 'pending',
      next_attempt_date: new Date(),
      processing_attempts: 0
    });
    console.log(`Reset withdrawal ${withdrawal.id}`);
  }
}

resetStuckWithdrawals();
```

### 2. Скрипт для проверки баланса на BUFF

```javascript
// scripts/check-buff-balance.js
const BuffService = require('../services/buffService');

async function checkBuffBalance() {
  const buffConfig = BuffService.loadConfig();
  const buffService = new BuffService(buffConfig);

  try {
    await buffService.initialize();
    // Пример запроса для получения баланса
    const response = await buffService.axiosInstance.get('/api/v2/account/balance');
    console.log('BUFF Balance:', response.data);
  } catch (error) {
    console.error('Error checking BUFF balance:', error);
  } finally {
    await buffService.close();
  }
}

checkBuffBalance();
```

---

## Важные примечания

1. **Безопасность**: Храните учетные данные BUFF и Steam бота в безопасном месте, не включайте их в публичные репозитории.

2. **Обновление куки**: Куки BUFF имеют ограниченный срок действия, регулярно обновляйте их.

3. **Баланс BUFF**: Убедитесь, что на аккаунте BUFF достаточно средств для покупки предметов.

4. **Резервное копирование**: Регулярно делайте резервные копии базы данных и конфигурационных файлов.

5. **Поддержка BUFF API**: Учтите, что BUFF может изменить свое API, что потребует обновления BuffService.

6. **Steam ограничения**: Steam имеет ограничения на количество трейдов в день, учитывайте это при планировании нагрузки.
