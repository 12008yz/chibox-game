# Безопасный деплой frontend (prod)

Этот сценарий нужен, чтобы избежать белого экрана из-за рассинхрона `index.html` и `assets/js/index-*.js`.

## Что должно быть заранее

- На сервере есть скрипт: `deploy/nginx/deploy-frontend-safe.sh`
- Фронтенд-проект: `/var/www/chibox/frontend`
- Прод-статик папка: `/var/www/chibox/frontend/dist`
- Временная папка под новый билд: `/var/www/chibox/frontend-new/dist`

## Шаги деплоя

1. Собрать новый frontend:

```bash
cd /var/www/chibox/frontend
npm run build
```

2. Подготовить staging-папку с новым билдом:

```bash
mkdir -p /var/www/chibox/frontend-new
rm -rf /var/www/chibox/frontend-new/dist
cp -r /var/www/chibox/frontend/dist /var/www/chibox/frontend-new/
```

3. Запустить безопасный деплой:

```bash
SOURCE_DIST=/var/www/chibox/frontend-new/dist \
TARGET_DIST=/var/www/chibox/frontend/dist \
SITE_URL=https://chibox-game.ru \
API_CHECK_URL=https://chibox-game.ru/api/v1/cases \
bash /var/www/chibox/backend/deploy/nginx/deploy-frontend-safe.sh
```

## Что проверяет скрипт

- Актуальный `index.html` и ссылку на `index-*.js`
- `GET /`, `GET /manifest.json`, `GET /assets/js/index-*.js`, `GET /api/v1/cases`
- `nginx -t` перед `reload`

При ошибке проверок выполняется rollback на предыдущий `dist`.

## Быстрая ручная проверка после деплоя

```bash
curl -I https://chibox-game.ru
curl -I https://chibox-game.ru/manifest.json
curl -s https://chibox-game.ru | grep -oE '/assets/js/index-[^"]+\.js'
```
