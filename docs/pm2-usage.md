#!/bin/bash

# Скрипт для управления ChiBox Game через PM2

case "$1" in
"start")
echo "🚀 Запуск всех сервисов ChiBox Game..."
pm2 start ecosystem.config.js --env production
pm2 save
echo "✅ Все сервисы запущены!"
;;

"stop")
echo "🛑 Остановка всех сервисов ChiBox Game..."
pm2 stop ecosystem.config.js
echo "✅ Все сервисы остановлены!"
;;

"restart")
echo "🔄 Перезапуск всех сервисов ChiBox Game..."
pm2 restart ecosystem.config.js
echo "✅ Все сервисы перезапущены!"
;;

"status")
echo "📊 Статус сервисов ChiBox Game:"
pm2 status
;;

"logs")
if [ -z "$2" ]; then
echo "📋 Логи всех сервисов:"
pm2 logs
else
echo "📋 Логи сервиса $2:"
pm2 logs $2
fi
;;

"main-only")
echo "🚀 Запуск только основного приложения..."
pm2 start ecosystem.config.js --only chibox-main --env production
;;

"workers-only")
echo "🚀 Запуск только воркеров..."
pm2 start ecosystem.config.js --only chibox-workers --env production
;;

"monitoring")
echo "📊 Открытие мониторинга PM2..."
pm2 monit
;;

"flush-logs")
echo "🧹 Очистка логов PM2..."
pm2 flush
echo "✅ Логи очищены!"
;;

"reload")
echo "🔄 Graceful reload всех сервисов..."
pm2 reload ecosystem.config.js
echo "✅ Reload завершен!"
;;

"startup")
echo "🔧 Настройка автозапуска PM2..."
pm2 startup
pm2 save
echo "✅ Автозапуск настроен!"
;;

"dev")
echo "🛠️ Запуск в режиме разработки..."
pm2 start ecosystem.config.js --env development
;;

"queue-stats")
echo "📊 Статистика очередей..."
npm run queue:stats
;;

"queue-clean")
echo "🧹 Очистка очередей..."
npm run queue:clean
;;

\*)
echo "ChiBox Game PM2 Management Script"
echo ""
echo "Использование: $0 {команда} [параметры]"
echo ""
echo "Команды:"
echo " start - Запустить все сервисы"
echo " stop - Остановить все сервисы"
echo " restart - Перезапустить все сервисы"
echo " reload - Graceful reload всех сервисов"
echo " status - Показать статус всех сервисов"
echo " logs [name] - Показать логи (всех или конкретного сервиса)"
echo " monitoring - Открыть мониторинг PM2"
echo " flush-logs - Очистить все логи"
echo " startup - Настроить автозапуск"
echo " dev - Запустить в режиме разработки"
echo " main-only - Запустить только основное приложение"
echo " workers-only - Запустить только воркеров"
echo " queue-stats - Показать статистику очередей"
echo " queue-clean - Очистить очереди"
echo ""
echo "Примеры:"
echo " $0 start"
echo " $0 logs chibox-main"
echo " $0 status"
;;
esac
