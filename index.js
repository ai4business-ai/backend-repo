require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Telegraf } = require('telegraf');
const { OpenAI } = require('openai');

const app = express();
app.use(cors());
app.use(express.json());

// Конфигурация
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL || `https://${process.env.RENDER_EXTERNAL_HOSTNAME || 'localhost'}`;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Проверка наличия требуемых переменных окружения
if (!OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY не установлен в .env файле');
  process.exit(1);
}

if (!TELEGRAM_BOT_TOKEN) {
  console.error('TELEGRAM_BOT_TOKEN не установлен в .env файле');
  process.exit(1);
}

// Инициализация OpenAI
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// Инициализация бота
const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

// Хранение состояний пользователей
const userStates = {};

// Обработка /start
bot.start((ctx) => {
  ctx.reply('Добро пожаловать в AI Factory! Выберите инструмент из меню.', {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Открыть инструменты", web_app: { url: process.env.FRONTEND_URL || "https://ai4business-ai.github.io/frontend-repo/" } }]
      ]
    }
  });
});

// Обработчик помощи
bot.help((ctx) => {
  ctx.reply('AI Factory помогает вам создавать и развивать бизнес с использованием ИИ. Нажмите кнопку "Открыть инструменты" ниже, чтобы начать работу.', {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Открыть инструменты", web_app: { url: process.env.FRONTEND_URL || "https://ai4business-ai.github.io/frontend-repo/" } }]
      ]
    }
  });
});

// Функция для работы с OpenAI Assistants
async function getAssistantResponse(prompt, userInput) {
  try {
    console.log(`Создание ассистента с инструкцией: ${prompt.substring(0, 50)}...`);
    
    // Создаем ассистента для конкретного запроса
    const assistant = await openai.beta.assistants.create({
      name: "AI Factory Business Assistant",
      instructions: prompt,
      model: "gpt-4-turbo-preview",
      tools: [{ type: "code_interpreter" }]
    });
    
    console.log(`Создан ассистент ID: ${assistant.id}`);
    
    // Создаем новый тред для разговора
    const thread = await openai.beta.threads.create();
    console.log(`Создан тред ID: ${thread.id}`);
    
    // Добавляем сообщение пользователя в тред
    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: userInput
    });
    console.log(`Добавлено сообщение пользователя: ${userInput.substring(0, 50)}...`);
    
    // Запускаем ассистента для обработки сообщения
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: assistant.id
    });
    console.log(`Запущен ассистент, run ID: ${run.id}`);
    
    // Ждем завершения обработки
    let runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
    console.log(`Начальный статус: ${runStatus.status}`);
    
    // Ожидаем завершения обработки запроса
    while (['in_progress', 'queued', 'requires_action'].includes(runStatus.status)) {
      console.log(`Текущий статус: ${runStatus.status}, ожидаем...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      
      if (runStatus.status === 'failed') {
        console.error('Ошибка выполнения ассистента:', runStatus.last_error);
        throw new Error(`Assistant run failed: ${runStatus.last_error?.message || 'Unknown error'}`);
      }
    }
    
    console.log(`Обработка завершена со статусом: ${runStatus.status}`);
    
    // Получаем сообщения
    const messages = await openai.beta.threads.messages.list(thread.id);
    
    // Возвращаем последнее сообщение ассистента
    const assistantMessages = messages.data.filter(msg => msg.role === 'assistant');
    if (assistantMessages.length > 0) {
      const lastMessage = assistantMessages[0];
      console.log(`Получен ответ ассистента длиной: ${lastMessage.content[0].text.value.length} символов`);
      return lastMessage.content[0].text.value;
    }
    
    return "Извините, не удалось получить ответ от ассистента.";
  } catch (error) {
    console.error('Ошибка при использовании OpenAI Assistant:', error);
    throw error;
  }
}

// Обработка данных от веб-приложения
bot.on('web_app_data', async (ctx) => {
  try {
    console.log('Получены данные из веб-приложения. Пользователь:', ctx.from.id);
    console.log('Полученные данные:', ctx.webAppData.data);
    
    let data;
    try {
      data = JSON.parse(ctx.webAppData.data);
      console.log('Разобранные данные:', data);
    } catch (jsonError) {
      console.error('Ошибка при разборе JSON из веб-приложения:', jsonError);
      return ctx.reply('Произошла ошибка при обработке ваших данных. Попробуйте еще раз.');
    }
    
    if (data.action === "openGPT" && data.tool === "marketAnalysisBtn") {
      // Запоминаем, что пользователь ждет анализа рынка
      userStates[ctx.from.id] = { 
        waitingFor: 'marketAnalysisBtn'
      };
      
      await ctx.reply('🔍 Анализ рынка и конкурентов');
      await ctx.reply('Опишите ваш бизнес или продукт для анализа рынка:');
    } else if (data.action === "businessIdea") {
      await ctx.reply('💡 Генерация бизнес-идей');
      await ctx.reply('Опишите область или интересы, для которых вы хотите получить идеи:');
      
      userStates[ctx.from.id] = { 
        waitingFor: 'businessIdea'
      };
    } else if (data.action === "businessModel") {
      await ctx.reply('📝 Составление бизнес-модели');
      await ctx.reply('Опишите ваш бизнес для составления бизнес-модели:');
      
      userStates[ctx.from.id] = { 
        waitingFor: 'businessModel'
      };
    } else if (data.action === "cases") {
      await ctx.reply('📚 Подбор идей из кейсов');
      await ctx.reply('Опишите проблему или отрасль для подбора релевантных кейсов:');
      
      userStates[ctx.from.id] = { 
        waitingFor: 'cases'
      };
    } else {
      await ctx.reply('Выберите опцию из меню инструментов');
    }
  } catch (error) {
    console.error('Ошибка обработки данных веб-приложения:', error);
    ctx.reply('Произошла ошибка. Пожалуйста, попробуйте позже.');
  }
});

// Обработка текстовых сообщений
bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const userState = userStates[userId];
  
  // Если пользователь не в режиме ожидания, игнорируем
  if (!userState) return;
  
  const userInput = ctx.message.text;
  const waitingFor = userState.waitingFor;
  
  // Очищаем состояние пользователя
  delete userStates[userId];
  
  await ctx.reply('⏳ Анализирую информацию, это может занять некоторое время...');
  
  try {
    let prompt = '';
    // Выбираем промпт в зависимости от запрошенного инструмента
    switch (waitingFor) {
      case 'marketAnalysisBtn':
        prompt = "Ты эксперт по анализу рынка. Проведи краткий анализ рынка и конкурентов для следующего бизнеса или продукта. Укажи: основные сегменты рынка, ключевых конкурентов, примерный размер рынка, тренды и возможности. Твой ответ должен быть структурированным и содержать полезные рекомендации.";
        break;
      case 'businessIdea':
        prompt = "Ты эксперт по генерации бизнес-идей. Предложи 5 инновационных бизнес-идей на основе следующих интересов или области. Для каждой идеи укажи: концепцию, потенциальную целевую аудиторию, примеры реализации и возможные источники дохода. Твой ответ должен быть структурированным и содержать практические рекомендации.";
        break;
      case 'businessModel':
        prompt = "Ты эксперт по бизнес-моделированию. Создай структурированную бизнес-модель для описанного бизнеса, используя структуру Canvas. Включи следующие элементы: ценностное предложение, сегменты клиентов, каналы сбыта, взаимоотношения с клиентами, потоки доходов, ключевые ресурсы, ключевые виды деятельности, ключевые партнеры и структуру расходов. Твой ответ должен быть структурированным и содержать конкретные рекомендации.";
        break;
      case 'cases':
        prompt = "Ты эксперт по бизнес-кейсам. Подбери 3-5 реальных кейсов успешных компаний, которые решали похожие проблемы или работали в указанной отрасли. Для каждого кейса укажи: название компании, краткое описание проблемы, примененное решение, и достигнутые результаты. Также добавь, как эти принципы можно применить к новому бизнесу. Твой ответ должен быть структурированным и содержать конкретные примеры и практические рекомендации.";
        break;
      default:
        prompt = "Ты бизнес-консультант. Ответь на следующий запрос, предоставив полезную и профессиональную информацию.";
    }
    
    console.log(`Отправка запроса к OpenAI Assistant для пользователя ${userId}`);
    console.log(`Тип запроса: ${waitingFor}`);
    
    // Получаем ответ от OpenAI Assistant
    const gptResponse = await getAssistantResponse(prompt, userInput);
    
    // Отправляем ответ пользователю частями, если он длинный
    if (gptResponse.length > 4000) {
      const parts = gptResponse.match(/.{1,4000}/gs);
      for (const part of parts) {
        await ctx.reply(part);
      }
    } else {
      await ctx.reply(gptResponse);
    }
    
    // Отправляем предложение начать снова
    await ctx.reply("Хотите выполнить ещё один запрос? Нажмите кнопку ниже", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Открыть инструменты заново", web_app: { url: process.env.FRONTEND_URL || "https://ai4business-ai.github.io/frontend-repo/" } }]
        ]
      }
    });
    
  } catch (error) {
    console.error('Ошибка при запросе к OpenAI API:', error.response?.data || error.message);
    ctx.reply('Произошла ошибка при анализе. Пожалуйста, попробуйте позже.');
  }
});

// Обработчик для инлайн-запросов
bot.on('inline_query', async (ctx) => {
  await ctx.answerInlineQuery([
    {
      type: 'article',
      id: '1',
      title: 'Открыть бизнес-инструменты',
      description: 'Нажмите, чтобы открыть AI Factory',
      input_message_content: {
        message_text: 'Я хочу воспользоваться бизнес-инструментами AI Factory!'
      },
      reply_markup: {
        inline_keyboard: [
          [{ text: "Открыть инструменты", web_app: { url: process.env.FRONTEND_URL || "https://ai4business-ai.github.io/frontend-repo/" } }]
        ]
      }
    }
  ]);
});

// Маршрут для проверки работоспособности сервера
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    version: '1.1.0',
    environment: NODE_ENV,
    botInfo: {
      webhookMode: NODE_ENV === 'production'
    } 
  });
});

// Запуск HTTP сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT} в режиме ${NODE_ENV}`);
});

// Настройка и запуск бота
if (NODE_ENV === 'production') {
  // В продакшене использовать webhook
  const webhookPath = '/webhook';
  const webhookUrl = `${WEBHOOK_URL}${webhookPath}`;
  
  console.log(`Настройка вебхука на URL: ${webhookUrl}`);
  
  // Настройка Express для обработки вебхука
  app.use(bot.webhookCallback(webhookPath));
  
  // Устанавливаем вебхук
  bot.telegram.setWebhook(webhookUrl)
    .then(() => {
      console.log('Вебхук успешно установлен');
    })
    .catch(err => {
      console.error('Ошибка при установке вебхука:', err);
    });
    
  // Маршрут для проверки статуса вебхука
  app.get('/webhook-info', async (req, res) => {
    try {
      const info = await bot.telegram.getWebhookInfo();
      res.status(200).json(info);
    } catch (error) {
      console.error('Ошибка при получении информации о вебхуке:', error);
      res.status(500).json({ error: 'Не удалось получить информацию о вебхуке' });
    }
  });
} else {
  // В режиме разработки используем long polling
  bot.launch()
    .then(() => {
      console.log('Telegram бот успешно запущен в режиме long-polling');
    })
    .catch(err => {
      console.error('Ошибка запуска бота:', err);
    });
}

// Обработка выхода
process.once('SIGINT', () => {
  bot.stop('SIGINT');
});
process.once('SIGTERM', () => {
  bot.stop('SIGTERM');
});
