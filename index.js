require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { Telegraf } = require('telegraf');

const app = express();
app.use(cors());
app.use(express.json());

// Конфигурация
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// Проверка наличия требуемых переменных окружения
if (!OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY не установлен в .env файле');
  process.exit(1);
}

if (!TELEGRAM_BOT_TOKEN) {
  console.error('TELEGRAM_BOT_TOKEN не установлен в .env файле');
  process.exit(1);
}

// Инициализация бота
const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

// Хранение состояний пользователей
const userStates = {};

// Обработка /start
bot.start((ctx) => {
  ctx.reply('Добро пожаловать в AI Factory! Выберите инструмент из меню.', {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Открыть инструменты", web_app: { url: "https://ai4business-ai.github.io/frontend-repo/" } }]
      ]
    }
  });
});

// Обработка данных от веб-приложения
bot.on('web_app_data', async (ctx) => {
  try {
    console.log('Получены данные из веб-приложения:', ctx.webAppData.data);
    const data = JSON.parse(ctx.webAppData.data);
    
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
        prompt = "Ты эксперт по анализу рынка. Проведи краткий анализ рынка и конкурентов для следующего бизнеса или продукта. Укажи: основные сегменты рынка, ключевых конкурентов, примерный размер рынка, тренды и возможности.";
        break;
      case 'businessIdea':
        prompt = "Ты эксперт по генерации бизнес-идей. Предложи 5 инновационных бизнес-идей на основе следующих интересов или области. Для каждой идеи укажи: концепцию, потенциальную целевую аудиторию, примеры реализации и возможные источники дохода.";
        break;
      case 'businessModel':
        prompt = "Ты эксперт по бизнес-моделированию. Создай структурированную бизнес-модель для описанного бизнеса. Включи следующие элементы: ценностное предложение, сегменты клиентов, каналы сбыта, взаимоотношения с клиентами, потоки доходов, ключевые ресурсы, ключевые виды деятельности, ключевые партнеры и структуру расходов.";
        break;
      case 'cases':
        prompt = "Ты эксперт по бизнес-кейсам. Подбери 3-5 реальных кейсов успешных компаний, которые решали похожие проблемы или работали в указанной отрасли. Для каждого кейса укажи: название компании, краткое описание проблемы, примененное решение, и достигнутые результаты. Также добавь, как эти принципы можно применить к новому бизнесу.";
        break;
      default:
        prompt = "Ты бизнес-консультант. Ответь на следующий запрос, предоставив полезную и профессиональную информацию.";
    }
    
    // Запрос к OpenAI API с использованием актуальной модели
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: "gpt-4", // Используем стабильную доступную модель
        messages: [
          { 
            role: "system", 
            content: prompt
          },
          { 
            role: "user", 
            content: userInput 
          }
        ],
        max_tokens: 3000 // Ограничиваем длину ответа для избежания проблем с лимитами сообщений
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const gptResponse = response.data.choices[0].message.content;
    
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
          [{ text: "Открыть инструменты заново", web_app: { url: "https://ai4business-ai.github.io/frontend-repo/" } }]
        ]
      }
    });
    
  } catch (error) {
    console.error('Ошибка при запросе к OpenAI API:', error.response?.data || error.message);
    ctx.reply('Произошла ошибка при анализе. Пожалуйста, попробуйте позже.');
  }
});

// Обработчик для инлайн-запросов (если нужен)
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
          [{ text: "Открыть инструменты", web_app: { url: "https://ai4business-ai.github.io/frontend-repo/" } }]
        ]
      }
    }
  ]);
});

// Маршрут для проверки работоспособности сервера
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', version: '1.0.0' });
});

// Запуск HTTP сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});

// Запуск бота
bot.launch().then(() => {
  console.log('Telegram бот успешно запущен');
}).catch(err => {
  console.error('Ошибка запуска бота:', err);
});

// Обработка выхода
process.once('SIGINT', () => {
  bot.stop('SIGINT');
});
process.once('SIGTERM', () => {
  bot.stop('SIGTERM');
});
