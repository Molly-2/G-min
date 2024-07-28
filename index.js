const express = require('express');
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const { Buffer } = require('buffer');

const app = express();
const port = 3000;
const API_KEY = "AIzaSyB4XGZJ359gmhdaSmk8dL93uXEzd9spJw8";

const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.0-pro-latest" });

const persistentChats = new Map();

const safetySettings = [
  { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
];

app.get('/gemini', async (req, res) => {
    const prompt = req.query.prompt;
    const userID = req.query.userID || 'defaultUser';

    if (!prompt) {
        return res.status(400).send('Prompt query parameter is required');
    }

    try {
        let chatHistory = readChatHistory(userID);

        if (!persistentChats.has(userID)) {
            persistentChats.set(userID, model.startChat({
                model: "gemini-1.0-pro-latest",
                history: chatHistory,
                safetySettings: safetySettings,
                generationConfig: { maxOutputTokens: 2048 },
            }));
        }

        const persistentChat = persistentChats.get(userID);
        const result = await persistentChat.sendMessage(prompt, safetySettings);
        const response = await result.response;
        const text = response.text();

        appendToChatHistory(userID, { role: "user", parts: [{ text: prompt }] });
        appendToChatHistory(userID, { role: "model", parts: [{ text: text }] });

        res.json({ response: text });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error generating response from Gemini API');
    }
});

function ensureChatHistoryFile(userID) {
    const directoryPath = path.join(__dirname, 'chatHistory');
    if (!fs.existsSync(directoryPath)) {
        fs.mkdirSync(directoryPath);
    }
    const filePath = path.join(directoryPath, `${userID}gemini.json`);
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify([], null, 2));
    }
    return filePath;
}

function readChatHistory(userID) {
    const filePath = ensureChatHistoryFile(userID);
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error(`Error reading chat history for user ${userID}:`, err);
        return [];
    }
}

function appendToChatHistory(userID, messageObject) {
    const filePath = ensureChatHistoryFile(userID);
    try {
        const chatHistory = readChatHistory(userID);
        chatHistory.push(messageObject);
        fs.writeFileSync(filePath, JSON.stringify(chatHistory, null, 2));
    } catch (err) {
        console.error(`Error appending message to chat history for user ${userID}:`, err);
    }
}

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
