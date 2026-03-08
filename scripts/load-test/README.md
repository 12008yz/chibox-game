# Нагрузочное тестирование

Проверка готовности к 500+ одновременным пользователям.

## 1. Быстрый тест (autocannon) — только HTTP

Без авторизации, бьёт по одному URL:

```bash
# Локально
npm run load-test

# Прод (сначала мало соединений!)
set BASE_URL=https://api.chibox-game.ru
npx autocannon -c 20 -d 20 %BASE_URL%/api/v1/cases
```

На Linux/Mac: `BASE_URL=https://api.chibox-game.ru npx autocannon -c 20 -d 20 $BASE_URL/api/v1/cases`

## 2. Сценарии (Artillery) — несколько эндпоинтов

```bash
# Установить движок один раз (уже в devDependencies)
npm install

# Локально
npx artillery run scripts/load-test/artillery-http.yml

# Прод — сначала короткая фаза
set BASE_URL=https://api.chibox-game.ru
npx artillery run scripts/load-test/artillery-http.yml
```

В YAML можно править `phases`: `arrivalRate` (пользователей/сек), `duration` (секунды).

## 3. Socket.IO (опционально)

Для нагрузки на WebSocket нужен движок под Socket.IO v4:

```bash
npm install artillery-engine-socketio-v3 --save-dev
```

Пример сценария с подключением к сокету — см. [документацию Artillery Socket.IO](https://artillery.io/docs/reference/engines/socketio).

## Рекомендации для продакшена

1. **Сначала мало нагрузки:** `-c 20 -d 20` (20 соединений, 20 сек), потом поднимать.
2. **Следить за метриками:** CPU, память, пул БД (логи X-DB-Pool-* или мониторинг).
3. **Rate limit:** при 500 req/min на IP тест с одной машины может упираться в 429 — тогда тестировать с нескольких IP или временно ослабить лимит в тестовом окружении.
