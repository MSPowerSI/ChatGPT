import { Configuration, OpenAIApi } from "openai";
import * as dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import session from 'express-session';

dotenv.config();

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');

// Carregar as informações iniciais do arquivo config.json
const initialConfig = JSON.parse(fs.readFileSync('config.json', 'utf8'));

let messages = [];

if (initialConfig.companyName) {
  messages.push({ role: 'system', content: `Nome da empresa: ${initialConfig.companyName}` });
}

if (initialConfig.ownerName) {
  messages.push({ role: 'system', content: `Nome do proprietário: ${initialConfig.ownerName}` });
}

// Adicionar funções como mensagens do sistema
if (initialConfig.functions && Array.isArray(initialConfig.functions)) {
  for (const func of initialConfig.functions) {
    messages.push({ role: 'system', content: `Função: ${func}` });
  }
}

// Adicionar regras como mensagens do sistema
if (initialConfig.rules && Array.isArray(initialConfig.rules)) {
  for (const rule of initialConfig.rules) {
    messages.push({ role: 'system', content: `Regra: ${rule}` });
  }
}

app.get('/', (req, res) => {
  res.render('front', { messages: req?.session?.messages ? req.session.messages.filter(message => message.role !== 'system') : [] });
});

app.use(session({
  secret: process.env.SECRET_KEY,
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));

async function getAssistantMessage(messages) {
  const completion = await openai.createChatCompletion({
    model: 'gpt-3.5-turbo',
    messages: messages,
  });
  return completion.data.choices[0].message.content;
}

app.post('/chat', async (req, res) => {
  console.log(req?.session);
  const userMessage = req.body.content;
  if (!req.session.messages) {
    req.session.messages = messages;
  }
  req.session.messages.push({ role: 'user', content: userMessage });
  const assistantMessage = await getAssistantMessage(req.session.messages);
  req.session.messages.push({ role: 'assistant', content: assistantMessage });
  res.json({ content: assistantMessage });
});

app.listen(port, () => {
  console.log(`Chatbot rodando na porta ${port}`);
});