import OpenAI from 'openai';
import * as dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import session from 'express-session';
import { createClient } from 'redis';
import RedisStore from "connect-redis";

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.set('trust proxy', 1);

// Load initial information from config.json file
const initialConfig = JSON.parse(fs.readFileSync('config.json', 'utf8'));

let messages = [];

if (initialConfig.companyName) {
    messages.push({ role: 'system', content: `Company Name: ${initialConfig.companyName}` });
}

// Add functions as system messages
if (initialConfig.functions && Array.isArray(initialConfig.functions)) {
    for (const func of initialConfig.functions) {
        messages.push({ role: 'system', content: `Função: ${func}` });
    }
}

// Add rules as system messages
if (initialConfig.rules && Array.isArray(initialConfig.rules)) {
    for (const rule of initialConfig.rules) {
        messages.push({ role: 'system', content: `Regra: ${rule}` });
    }
}

if (initialConfig.initMessages && Array.isArray(initialConfig.initMessages)) {
    for (const message of initialConfig.initMessages) {
        messages.push({ role: 'assistant', content: message });
    }
}

let redisClient = createClient({
  url: process.env.REDIS_URL,
});

redisClient.connect().catch(console.error);

let redisStore = new RedisStore({
  client: redisClient,
});

redisClient.on("error", function (err) {
  console.log("Could not establish a connection with redis. " + err);
});
redisClient.on("connect", function (err) {
  console.log("Connected to redis successfully");
});

app.use(
  session({
    cookie: {
      secure: true,
      maxAge: 1000 * 60 * 10 // session max age in miliseconds
    },
    store: redisStore,
    secret: process.env.SECRET_KEY,
    resave: false,
    saveUninitialized: false
  })
);

app.get('/', (req, res) => {
    // Load the chat messages from the session
    req.session.messages = (req.session.messages != undefined || req.session.messages != null) ? req.session.messages : [...messages];

    res.render('front', { messages: req.session.messages.filter(message => message.role !== 'system') });
});


app.post('/chat', async (req, res) => {
  const userMessage = req.body.content;

  if (!req.session.messages) {
    req.session.messages = [];
    req.session.messages = [...messages];
  }

  req.session.messages.push({ role: "user", content: userMessage });

  const filteredMessages = req.session.messages.filter((message) => message.role !== "assistant");

  const stream = await openai.chat.completions.create(
    {
      model: "gpt-3.5-turbo",
      stream: true,
      messages: filteredMessages,
    },
    { responseType: "stream" }
  );

  res.setHeader('Content-Type', 'text/plain');

  let assistantMessage = '';

  for await (const part of stream) {
    const content = part.choices[0]?.delta?.content || '';
    res.write(content);
    assistantMessage += content;
  }

  req.session.messages.push({ role: "assistant", content: assistantMessage });

  res.end();
});

app.listen(port, () => {
    console.log(`Chatbot running on port ${port}`);
});
