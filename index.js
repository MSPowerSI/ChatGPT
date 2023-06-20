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

// Load initial information from config.json file
const initialConfig = JSON.parse(fs.readFileSync('config.json', 'utf8'));

let messages = [];

if (initialConfig.companyName) {
    messages.push({ role: 'system', content: `Company Name: ${initialConfig.companyName}` });
}

if (initialConfig.ownerName) {
    messages.push({ role: 'system', content: `Owner Name: ${initialConfig.ownerName}` });
}

// Add functions as system messages
if (initialConfig.functions && Array.isArray(initialConfig.functions)) {
    for (const func of initialConfig.functions) {
        messages.push({ role: 'system', content: `Function: ${func}` });
    }
}

// Add rules as system messages
if (initialConfig.rules && Array.isArray(initialConfig.rules)) {
    for (const rule of initialConfig.rules) {
        messages.push({ role: 'system', content: `Rule: ${rule}` });
    }
}

app.use(session({
    secret: process.env.SECRET_KEY,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

app.get('/', (req, res) => {
    // Load the chat messages from the session
    req.session.messages = req.session.messages || messages;

    res.render('front', { messages: req.session.messages.filter(message => message.role !== 'system') });
});

async function getAssistantMessage(messages) {
    const completion = await openai.createChatCompletion({
        model: 'gpt-3.5-turbo',
        messages: messages,
    });

    return completion.data.choices[0].message.content;
}

app.post('/chat', async (req, res) => {
    const userMessage = req.body.content;

    req.session.messages = req.session.messages || messages;

    req.session.messages.push({ role: 'user', content: userMessage });

    const assistantMessage = await getAssistantMessage(req.session.messages);

    req.session.messages.push({ role: 'assistant', content: assistantMessage });

    res.json({ content: assistantMessage });
});

app.listen(port, () => {
    console.log(`Chatbot running on port ${port}`);
});
