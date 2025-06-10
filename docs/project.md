# 🚀 Полное руководство по выпуску ChiBox Game в Production

## 🎯 Что такое Production?

**Production** - это реальная рабочая среда, где:

- Ваше приложение доступно пользователям 24/7
- Идут реальные платежи и трейды
- Приложение должно работать стабильно и быстро

## 📋 План выпуска (пошагово)

### **Этап 1: Аренда сервера**

#### Варианты серверов:

**🌟 Рекомендуемые (для начала):**

- **VPS.ru** - от 500₽/месяц (2GB RAM, 1 CPU)
- **TimeWeb** - от 390₽/месяц (1GB RAM, 1 CPU)
- **Selectel** - от 450₽/месяц (2GB RAM, 1 CPU)

**🔥 Более мощные:**

- **DigitalOcean** - от $12/месяц (2GB RAM, 1 CPU)
- **Vultr** - от $10/месяц (2GB RAM, 1 CPU)
- **AWS EC2** - от $15/месяц (t3.small)

#### Минимальные требования:

```
CPU: 1-2 ядра
RAM: 2GB (минимум), 4GB (рекомендуется)
Диск: 20GB SSD
ОС: Ubuntu 20.04/22.04 LTS
```

### **Этап 2: Настройка сервера**

#### 2.1 Подключение к серверу

```bash
# Подключение по SSH (замените IP на ваш)
ssh root@your-server-ip

# Создание пользователя для приложения
adduser chibox
usermod -aG sudo chibox
su - chibox
```

#### 2.2 Установка необходимого ПО

```bash
# Обновление системы
sudo apt update && sudo apt upgrade -y

# Установка Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Установка PM2 глобально
sudo npm install -g pm2

# Установка PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Установка Redis
sudo apt install -y redis-server

# Установка Git
sudo apt install -y git

# Установка Nginx (веб-сервер)
sudo apt install -y nginx
```

#### 2.3 Настройка PostgreSQL

**⚠️ ВАЖНО**: Если у вас уже есть база данных с данными, смотрите `docs/database-migration.md`

```bash
# Создание базы данных (для новой установки)
sudo -u postgres psql

-- В psql консоли:
CREATE DATABASE chibox_game;
CREATE USER chibox_user WITH PASSWORD 'your_secure_password_here';
GRANT ALL PRIVILEGES ON DATABASE chibox_game TO chibox_user;
\q
```

#### 2.4 Настройка Redis

```bash
# Запуск и автозапуск Redis
sudo systemctl start redis-server
sudo systemctl enable redis-server

# Проверка работы
redis-cli ping
# Должно вернуть: PONG
```

### **Этап 3: Загрузка приложения на сервер**

#### 3.1 Через Git (рекомендуется)

```bash
# Клонирование репозитория
cd /home/chibox
git clone https://github.com/your-username/chibox-game.git
cd chibox-game

# Установка зависимостей
npm install --production
```

#### 3.2 Через FileZilla/SCP (альтернатива)

```bash
# Загрузка архива проекта на сервер
scp -r ./chibox-game chibox@your-server-ip:/home/chibox/
```

### **Этап 4: Настройка конфигурации**

#### 4.1 Создание .env файла

```bash
# Создание файла конфигурации
cd /home/chibox/chibox-game
nano .env
```

```env
# === ОСНОВНЫЕ НАСТРОЙКИ ===
NODE_ENV=production
PORT=3000

# === БАЗА ДАННЫХ ===
DB_HOST=localhost
DB_PORT=5432
DB_NAME=chibox_game
DB_USER=chibox_user
DB_PASSWORD=your_secure_password_here
DATABASE_URL=postgresql://chibox_user:your_secure_password_here@localhost:5432/chibox_game

# === REDIS ===
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_URL=redis://localhost:6379

# === БЕЗОПАСНОСТЬ ===
JWT_SECRET=your_very_secure_jwt_secret_key_minimum_32_characters_long

# === ПЛАТЕЖИ (YooKassa) ===
YOOKASSA_SHOP_ID=your_shop_id
YOOKASSA_CLIENT_SECRET=your_client_secret
YOOKASSA_RETURN_URL=https://your-domain.com/payment/success

# === STEAM BOT ===
STEAM_BOT_USERNAME=your_steam_bot_username
STEAM_BOT_PASSWORD=your_steam_bot_password
STEAM_BOT_SHARED_SECRET=your_shared_secret
STEAM_BOT_IDENTITY_SECRET=your_identity_secret

# === BUFF INTEGRATION ===
BUFF_COOKIES=your_buff_cookies
BUFF_CSRF_TOKEN=your_buff_csrf_token
```

#### 4.2 Настройка базы данных

**Если у вас уже есть база с данными:**

```bash
# Смотрите подробную инструкцию в docs/database-migration.md
# Коротко: экспорт → загрузка → импорт
```

**Если создаете новую базу:**

```bash
# Установка Sequelize CLI
sudo npm install -g sequelize-cli

# Запуск миграций
npx sequelize-cli db:migrate

# Запуск seeders (начальные данные)
npx sequelize-cli db:seed:all
```

### **Этап 5: Настройка веб-сервера (Nginx)**

#### 5.1 Создание конфигурации Nginx

```bash
sudo nano /etc/nginx/sites-available/chibox-game
```

```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    # Статические файлы
    location /static/ {
        alias /home/chibox/chibox-game/public/;
        expires 30d;
        add_header Cache-Control "public, no-transform";
    }

    # Основное приложение
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

#### 5.2 Активация конфигурации

```bash
# Создание символической ссылки
sudo ln -s /etc/nginx/sites-available/chibox-game /etc/nginx/sites-enabled/

# Удаление стандартной конфигурации
sudo rm /etc/nginx/sites-enabled/default

# Проверка конфигурации
sudo nginx -t

# Перезапуск Nginx
sudo systemctl restart nginx
sudo systemctl enable nginx
```

### **Этап 6: Запуск приложения**

#### 6.1 Первоначальная настройка

```bash
cd /home/chibox/chibox-game

# Запуск скрипта настройки
chmod +x scripts/setup-production.sh
./scripts/setup-production.sh

# Запуск всех сервисов
chmod +x scripts/pm2-commands.sh
./scripts/pm2-commands.sh start

# Настройка автозапуска
./scripts/pm2-commands.sh startup
```

#### 6.2 Проверка работы

```bash
# Проверка статуса сервисов
./scripts/pm2-commands.sh status

# Проверка логов
./scripts/pm2-commands.sh logs

# Проверка доступности приложения
curl http://localhost:3000
```

### **Этап 7: Настройка домена (опционально)**

#### 7.1 Покупка домена

- **Reg.ru** - от 99₽/год (.ru домены)
- **Namecheap** - от $8/год (.com домены)
- **Cloudflare** - регистрация доменов

#### 7.2 Настройка DNS

```
Тип записи: A
Имя: @
Значение: your-server-ip

Тип записи: A
Имя: www
Значение: your-server-ip
```

#### 7.3 Установка SSL сертификата (HTTPS)

```bash
# Установка Certbot
sudo apt install -y certbot python3-certbot-nginx

# Получение SSL сертификата
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# Автоматическое обновление сертификатов
sudo crontab -e
# Добавить строку:
0 12 * * * /usr/bin/certbot renew --quiet
```

### **Этап 8: Настройка мониторинга**

#### 8.1 Мониторинг сервера

```bash
# Установка htop для мониторинга ресурсов
sudo apt install -y htop

# Просмотр использования ресурсов
htop
```

#### 8.2 Мониторинг приложения

```bash
# Мониторинг PM2
./scripts/pm2-commands.sh monitoring

# Просмотр логов в реальном времени
./scripts/pm2-commands.sh logs
```

#### 8.3 Настройка уведомлений (опционально)

```bash
# Установка PM2 модуля для уведомлений
pm2 install pm2-slack
# или
pm2 install pm2-telegram
```

### **Этап 9: Резервное копирование**

#### 9.1 Настройка автоматических бэкапов

```bash
# Создание скрипта бэкапа
nano /home/chibox/backup.sh
```

```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/home/chibox/backups"
mkdir -p $BACKUP_DIR

# Бэкап базы данных
pg_dump -h localhost -U chibox_user chibox_game > $BACKUP_DIR/db_backup_$DATE.sql

# Бэкап файлов приложения
tar -czf $BACKUP_DIR/app_backup_$DATE.tar.gz /home/chibox/chibox-game

# Удаление старых бэкапов (старше 7 дней)
find $BACKUP_DIR -name "*.sql" -mtime +7 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete

echo "Backup completed: $DATE"
```

```bash
# Настройка автоматического бэкапа
chmod +x /home/chibox/backup.sh
crontab -e
# Добавить строку (каждый день в 2:00):
0 2 * * * /home/chibox/backup.sh >> /home/chibox/backup.log 2>&1
```

## 🔧 Обслуживание Production

### Ежедневные проверки:

```bash
# Статус сервисов
./scripts/pm2-commands.sh status

# Использование ресурсов
htop

# Проверка логов на ошибки
./scripts/pm2-commands.sh logs | grep -i error
```

### Обновление приложения:

```bash
# 1. Создание бэкапа
./backup.sh

# 2. Остановка сервисов
./scripts/pm2-commands.sh stop

# 3. Обновление кода
git pull origin main
npm install --production

# 4. Миграции (если есть новые)
npx sequelize-cli db:migrate

# 5. Запуск сервисов
./scripts/pm2-commands.sh start
```

## 💰 Примерная стоимость в месяц

### Минимальная конфигурация:

- **Сервер VPS**: 500₽
- **Домен**: 8₽ (.ru в месяц)
- **SSL сертификат**: 0₽ (Let's Encrypt бесплатный)
- **Итого**: ~510₽/месяц

### Рекомендуемая конфигурация:

- **Сервер VPS (4GB RAM)**: 1000₽
- **Домен .com**: 67₽/месяц
- **Cloudflare Pro**: 1500₽/месяц (опционально)
- **Итого**: ~1070₽/месяц

## 🆘 Что делать если что-то сломалось

### Приложение не отвечает:

```bash
# Перезапуск всех сервисов
./scripts/pm2-commands.sh restart

# Проверка логов
./scripts/pm2-commands.sh logs
```

### База данных недоступна:

```bash
# Перезапуск PostgreSQL
sudo systemctl restart postgresql

# Проверка статуса
sudo systemctl status postgresql
```

### Сервер перегружен:

```bash
# Проверка использования ресурсов
htop

# Перезагрузка сервера
sudo reboot
```

## 📞 Поддержка

При возникновении проблем:

1. Проверьте логи: `./scripts/pm2-commands.sh logs`
2. Проверьте статус: `./scripts/pm2-commands.sh status`
3. Проверьте ресурсы сервера: `htop`
4. Проверьте работу внешних сервисов: Redis, PostgreSQL

---

**Поздравляем! Ваше приложение работает в Production! 🎉**
