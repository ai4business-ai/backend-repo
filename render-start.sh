#!/bin/bash
# This script is used by Render.com to start the service

# Вывод версий для диагностики
echo "Node.js version:"
node --version
echo "NPM version:"
npm --version

# Установка зависимостей
echo "Installing dependencies..."
npm install

# Проверка настроек окружения
echo "Checking environment..."
if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
  echo "WARNING: TELEGRAM_BOT_TOKEN is not set!"
fi

if [ -z "$OPENAI_API_KEY" ]; then
  echo "WARNING: OPENAI_API_KEY is not set!"
fi

if [ -z "$WEBHOOK_URL" ]; then
  echo "INFO: WEBHOOK_URL is not set, using default from RENDER_EXTERNAL_URL"
  export WEBHOOK_URL=$RENDER_EXTERNAL_URL
fi

# Установка режима production
export NODE_ENV=production

# Запуск сервера
echo "Starting server..."
npm start
