# Исправление проблемы с модулем promise

## Проблема

В логах появляется ошибка:
```
Error: Cannot find module './lib'
Require stack:
- /var/www/chibox/backend/node_modules/promise/index.js
```

## Причина

Это проблема с зависимостью `promise`, которая используется через `pug`. Модуль `promise` устарел и имеет проблемы с совместимостью.

## Решение

### Вариант 1: Переустановка зависимостей (рекомендуется)

```bash
cd /var/www/chibox/backend
rm -rf node_modules package-lock.json
npm install
pm2 restart all
```

### Вариант 2: Обновление pug (если используется)

```bash
cd /var/www/chibox/backend
npm update pug
pm2 restart all
```

### Вариант 3: Игнорирование ошибки (если не критично)

Если ошибка не влияет на работу приложения (pug может не использоваться), можно оставить как есть. Ошибка появляется только при загрузке модуля, но не влияет на работу API.

## Проверка

После переустановки проверьте логи:
```bash
pm2 logs --lines 50
```

Ошибка `Cannot find module './lib'` должна исчезнуть.
