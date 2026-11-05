# Mini App: эксплуатация (aiohttp + aiogram)

Этот документ описывает развёртывание Telegram Mini App поверх Python-сервиса на
`aiohttp` и бота на `aiogram`. Текущие backend/frontend исходники не изменяются:
шаблоны запуска используют отдельный Python-проект, каталог которого задаётся
переменной `APP_DIR`.

## Схема

```text
Telegram → HTTPS (nginx) → aiohttp (127.0.0.1:8080)
                              └─ aiogram polling/webhook
                         cloudflared (резервный HTTPS-туннель)
```

Для production предпочтительны домен и nginx с сертификатом Let's Encrypt.
`cloudflared` — fallback, когда входящий 443 недоступен; не запускайте nginx и
Cloudflare Tunnel на одном публичном порту.

## Подготовка сервера

1. Создайте непривилегированного пользователя и каталог приложения:

   ```bash
   sudo useradd --system --home /opt/sapphire-tavern --shell /usr/sbin/nologin sapphire
   sudo install -d -o sapphire -g sapphire /opt/sapphire-tavern
   cd /opt/sapphire-tavern
   python3 -m venv .venv
   .venv/bin/pip install -U pip
   .venv/bin/pip install aiohttp aiogram
   ```

2. Скопируйте backend в `/opt/sapphire-tavern` и установите зависимости из его
   `requirements.txt` (если он есть):

   ```bash
   sudo -u sapphire /opt/sapphire-tavern/.venv/bin/pip install -r requirements.txt
   ```

3. Скопируйте `.env.example` в `.env`, задайте `BOT_TOKEN`, URL Mini App и
   секреты. `.env` должен быть доступен только пользователю `sapphire`:

   ```bash
   sudo chown sapphire:sapphire /opt/sapphire-tavern/.env
   sudo chmod 600 /opt/sapphire-tavern/.env
   ```

   В aiohttp-приложении слушайте только `127.0.0.1:8080` (публичный HTTPS
   завершается в nginx). Статика Mini App должна обслуживаться приложением или
   nginx из заранее согласованного каталога.

## systemd

Шаблон находится в [`deploy/systemd/sapphire-tavern.service`](<deploy/systemd/sapphire-tavern.service>).
Перед установкой замените `APP_DIR`, `APP_MODULE` и пользователя, если ваши
имена отличаются. Для приложения с фабрикой aiohttp используйте, например,
`APP_MODULE=app:create_app`; для обычного скрипта — `APP_MODULE=main.py` и
исправьте `ExecStart` на `python main.py`.

```bash
sudo install -m 0644 deploy/systemd/sapphire-tavern.service \
  /etc/systemd/system/sapphire-tavern.service
sudo systemctl daemon-reload
sudo systemctl enable --now sapphire-tavern.service
sudo systemctl status sapphire-tavern.service
```

Полезные команды:

```bash
sudo systemctl restart sapphire-tavern.service
sudo systemctl stop sapphire-tavern.service
sudo journalctl -u sapphire-tavern.service -n 200 --no-pager
sudo journalctl -u sapphire-tavern.service -f
```

Не добавляйте `BOT_TOKEN` в unit-файл. Используйте `EnvironmentFile=/opt/sapphire-tavern/.env`.
Для webhook укажите в `.env` публичный `https://` URL и отдельный путь webhook;
для polling webhook должен быть отключён.

## nginx

Скопируйте и отредактируйте [`deploy/nginx/sapphire-tavern.conf.template`](<deploy/nginx/sapphire-tavern.conf.template>):
замените `miniapp.example.com`, пути сертификатов и каталог статики.
Шаблон проксирует `/api/`, `/webhook/` и websocket-соединения в aiohttp,
остальные запросы — в тот же upstream (при необходимости статические файлы
можно включить директивой `root`).

```bash
sudo install -m 0644 deploy/nginx/sapphire-tavern.conf.template \
  /etc/nginx/sites-available/sapphire-tavern
sudo ln -s /etc/nginx/sites-available/sapphire-tavern \
  /etc/nginx/sites-enabled/sapphire-tavern
sudo nginx -t
sudo systemctl reload nginx
```

До получения сертификата используйте временный HTTP server block или certbot:

```bash
sudo certbot --nginx -d miniapp.example.com
```

Проверка прокси:

```bash
curl -fsS https://miniapp.example.com/health
```

## cloudflared fallback

Шаблон туннеля находится в [`deploy/cloudflared/config.yml.example`](<deploy/cloudflared/config.yml.example>).
Установите `cloudflared`, выполните `cloudflared tunnel login`, затем создайте
named tunnel и подставьте его UUID и hostname. Резервный tunnel направляется
на локальный aiohttp (`http://127.0.0.1:8080`) либо на nginx (`https://127.0.0.1:443`,
если настроен `originServerName`).

```bash
cloudflared tunnel create sapphire-tavern
sudo install -d -m 0750 /etc/cloudflared
sudo install -m 0600 ~/.cloudflared/<TUNNEL-ID>.json /etc/cloudflared/
sudo install -m 0644 deploy/cloudflared/config.yml.example \
  /etc/cloudflared/config.yml
cloudflared tunnel ingress validate
cloudflared tunnel route dns sapphire-tavern miniapp.example.com
sudo cloudflared service install
sudo systemctl enable --now cloudflared
sudo systemctl status cloudflared
sudo journalctl -u cloudflared -f
```

Включайте tunnel только как fallback (или держите его постоянно вместо nginx,
но не создавайте два конкурирующих DNS-маршрута). Для webhook Telegram URL
должен совпадать с активным публичным hostname. Если используется webhook,
после переключения домена повторно задайте webhook и проверьте `getWebhookInfo`.

## Обновление изображений

Изображения не следует менять вручную в production без резервной копии.
Сначала проверьте каталог и права, затем синхронизируйте только разрешённые
PNG/SVG из репозитория. Пример безопасного обновления (путь замените на ваш):

```bash
cd /opt/sapphire-tavern
sudo -u sapphire git fetch --prune origin
sudo -u sapphire git checkout --force origin/main -- assets/
sudo -u sapphire find assets -type f \( -iname '*.png' -o -iname '*.svg' \) -print0 \
  | xargs -0 -r file --mime-type
sudo systemctl restart sapphire-tavern
```

Если изображения собираются отдельным скриптом проекта, запускайте его от
пользователя `sapphire` (пример: `python tools/generate-assets.py`), после чего
перезапустите сервис и очистите CDN/browser cache. Команду для ручной проверки
целостности добавьте в CI; не заменяйте `assets/` непроверенным архивом.

Для регулярного обновления можно использовать отдельный oneshot unit/timer.
Не выполняйте `git pull` от root и не храните токены в репозитории.

## Обновление приложения и откат

```bash
cd /opt/sapphire-tavern
sudo systemctl stop sapphire-tavern
sudo -u sapphire git fetch --prune origin
sudo -u sapphire git checkout --force origin/main
sudo -u sapphire .venv/bin/pip install -r requirements.txt
sudo systemctl start sapphire-tavern
sudo journalctl -u sapphire-tavern -n 100 --no-pager
```

Перед обновлением сохраните `.env` и данные бота. При ошибке вернитесь на
предыдущий commit (`git checkout <commit>`) и перезапустите unit.

## Диагностика

```bash
curl -v http://127.0.0.1:8080/health
sudo nginx -t
sudo ss -ltnp | grep -E ':80|:443|:8080'
sudo journalctl -u sapphire-tavern -u nginx -u cloudflared --since '30 min ago'
```

Частые причины: aiohttp слушает не тот адрес/порт, неверный `BOT_TOKEN`,
webhook всё ещё указывает на старый домен, либо в nginx не прокинут
`Upgrade/Connection` для websocket. Не публикуйте `.env`, токены и tunnel JSON
в git или в логи.
