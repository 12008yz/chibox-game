# =============================================================================
# ChiBox — как на проде (cv6828879): /etc/nginx/sites-enabled/chibox-game.ru
# =============================================================================
# Деплой: скопировать в sites-available и включить symlink в sites-enabled, затем:
#   sudo nginx -t && sudo systemctl reload nginx
#
# Сертификат: на сервере в nginx указан live/chibox-game.ru-0001 (рядом есть и
# chibox-game.ru — смотрите ls /etc/letsencrypt/live/).
#
# Отличия от «голого» прод-файла: map/upstream, /socket.io/, X-Forwarded-Host,
# regex для рефералок на streamer в одинарных кавычках (конец строки, не символ $).
# =============================================================================

# Важно: для обычных запросов без Upgrade — пустой Connection, чтобы работал keepalive к upstream (иначе '' → close и пул соединений бесполезен).
map $http_upgrade $connection_upgrade {
    ""      "";
    default upgrade;
}

upstream chibox_backend {
    server 127.0.0.1:3000;
    keepalive 64;
}

# =========================
# chibox-game.ru (main)
# =========================
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name chibox-game.ru www.chibox-game.ru;

    ssl_certificate     /etc/letsencrypt/live/chibox-game.ru-0001/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/chibox-game.ru-0001/privkey.pem;

    access_log /var/log/nginx/chibox-access.log;
    error_log  /var/log/nginx/chibox-error.log;

    client_max_body_size 32m;

    gzip on;
    gzip_vary on;
    gzip_comp_level 5;
    gzip_min_length 256;
    # Ответы от Node (/api/) по умолчанию не сжимались — нужен gzip_proxied (в http {} у Ubuntu он часто закомментирован)
    gzip_proxied any;
    # Рядом с .js/.css лежат .gz от vite-plugin-compression — отдаём готовый файл (быстрее и стабильнее для Lighthouse)
    gzip_static on;
    gzip_types text/plain text/css text/javascript application/javascript application/x-javascript application/json text/xml application/xml application/xml+rss image/svg+xml font/woff2;

    # Кэш на диске для статики (много мелких чтений из dist)
    open_file_cache max=10000 inactive=30s;
    open_file_cache_valid 45s;
    open_file_cache_min_uses 2;
    open_file_cache_errors on;

    # Vite: хеш в имени — можно год; повторные визиты не качают JS/CSS заново
    location ^~ /assets/ {
        root /var/www/chibox/frontend/dist;
        try_files $uri =404;
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # SPA: всегда свежий bootstrap, иначе после деплоя старый index тянет несуществующие чанки
    location = /index.html {
        root /var/www/chibox/frontend/dist;
        add_header Cache-Control "no-cache, must-revalidate";
    }

    location = /robots.txt {
        root /var/www/chibox/frontend/dist;
        default_type text/plain;
        access_log off;
    }

    location = /sitemap.xml {
        root /var/www/chibox/frontend/dist;
        default_type application/xml;
        access_log off;
    }

    location /api/ {
        proxy_pass http://chibox_backend;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host  $host;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        $connection_upgrade;
        proxy_read_timeout  86400s;
        proxy_send_timeout  86400s;
        # JSON API: буферизация по умолчанию быстрее для клиента, чем proxy_buffering off
        proxy_buffering on;
    }

    location /socket.io/ {
        proxy_pass http://chibox_backend;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host  $host;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        $connection_upgrade;
        proxy_read_timeout  86400s;
        proxy_send_timeout  86400s;
        proxy_buffering off;
    }

    # Картинки кейсов лежат на бэкенде; баннеры/лого/статики из public — во frontend dist (раньше весь /images/ шёл в backend и баннеров там могло не быть)
    location ^~ /images/cases/ {
        alias /var/www/chibox/backend/public/images/cases/;
        expires 7d;
        add_header Cache-Control "public";
    }

    location ^~ /images/ {
        root /var/www/chibox/frontend/dist;
        try_files $uri =404;
        expires 7d;
        add_header Cache-Control "public";
    }

    location /public/ {
        alias /var/www/chibox/backend/public/;
        try_files $uri $uri/ =404;
        expires 7d;
        add_header Cache-Control "public";
    }

    location /Achievements/ {
        alias /var/www/chibox/backend/public/Achievements/;
        try_files $uri $uri/ =404;
        expires 7d;
        add_header Cache-Control "public";
    }

    location / {
        root /var/www/chibox/frontend/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }
}

server {
    listen 80;
    listen [::]:80;
    server_name chibox-game.ru www.chibox-game.ru;
    return 301 https://$host$request_uri;
}

# =========================
# streamer.chibox-game.ru
# =========================
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name streamer.chibox-game.ru;

    ssl_certificate     /etc/letsencrypt/live/chibox-game.ru-0001/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/chibox-game.ru-0001/privkey.pem;

    access_log /var/log/nginx/chibox-access.log;
    error_log  /var/log/nginx/chibox-error.log;

    client_max_body_size 32m;

    gzip on;
    gzip_vary on;
    gzip_comp_level 5;
    gzip_min_length 256;
    gzip_proxied any;
    gzip_static on;
    gzip_types text/plain text/css text/javascript application/javascript application/x-javascript application/json text/xml application/xml application/xml+rss image/svg+xml font/woff2;

    open_file_cache max=10000 inactive=30s;
    open_file_cache_valid 45s;
    open_file_cache_min_uses 2;
    open_file_cache_errors on;

    location ^~ /assets/ {
        root /var/www/chibox/frontend/dist;
        try_files $uri =404;
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    location = /index.html {
        root /var/www/chibox/frontend/dist;
        add_header Cache-Control "no-cache, must-revalidate";
    }

    location ^~ /r/ {
        rewrite ^/r/(.*)$ /api/v1/referral/redirect/$1 break;
        proxy_pass http://chibox_backend;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host  $host;
    }

    location ~ '^/([-A-Za-z0-9_]{4,64})$' {
        rewrite ^/(.*)$ /api/v1/referral/redirect/$1 break;
        proxy_pass http://chibox_backend;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host  $host;
    }

    location /api/ {
        proxy_pass http://chibox_backend;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host  $host;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        $connection_upgrade;
        proxy_read_timeout  86400s;
        proxy_send_timeout  86400s;
        proxy_buffering on;
    }

    location /socket.io/ {
        proxy_pass http://chibox_backend;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host  $host;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        $connection_upgrade;
        proxy_read_timeout  86400s;
        proxy_send_timeout  86400s;
        proxy_buffering off;
    }

    location ^~ /images/cases/ {
        alias /var/www/chibox/backend/public/images/cases/;
        expires 7d;
        add_header Cache-Control "public";
    }

    location ^~ /images/ {
        root /var/www/chibox/frontend/dist;
        try_files $uri =404;
        expires 7d;
        add_header Cache-Control "public";
    }

    location /public/ {
        alias /var/www/chibox/backend/public/;
        try_files $uri $uri/ =404;
        expires 7d;
        add_header Cache-Control "public";
    }

    location /Achievements/ {
        alias /var/www/chibox/backend/public/Achievements/;
        try_files $uri $uri/ =404;
        expires 7d;
        add_header Cache-Control "public";
    }

    location / {
        root /var/www/chibox/frontend/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }
}

server {
    listen 80;
    listen [::]:80;
    server_name streamer.chibox-game.ru;
    return 301 https://$host$request_uri;
}
