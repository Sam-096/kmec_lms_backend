// Groq-backed AI service.
//
// File name is preserved (`ollamaService.js`) so existing controllers that
// `require('../services/ollamaService')` keep working with zero diff.
// Exports the same surface: generate, chat, isAvailable.
//
// Env vars:
//   GROQ_API_KEY  (required)
//   GROQ_MODEL    (optional, defaults to 'llama-3.3-70b-versatile')

const axios = require('axios');

const GROQ_URL   = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

const getKey = () => process.env.GROQ_API_KEY;

const buildHeaders = () => ({
  Authorization: `Bearer ${getKey()}`,
  'Content-Type': 'application/json',
});

// Mirrors Ollama's `num_predict`/`num_ctx` intent — keep responses tight & fast.
const DEFAULTS = {
  temperature: 0.7,
  top_p:       0.9,
  max_tokens:  300,
};

async function generate(prompt, systemPrompt = '') {
  if (!getKey()) throw new Error('GROQ_API_KEY is not configured');

  const messages = [];
  if (systemPrompt && systemPrompt.trim()) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  const response = await axios.post(
    GROQ_URL,
    { model: GROQ_MODEL, messages, ...DEFAULTS, stream: false },
    { timeout: 30000, headers: buildHeaders() }
  );

  return response?.data?.choices?.[0]?.message?.content ?? '';
}

async function chat(messages) {
  if (!getKey()) throw new Error('GROQ_API_KEY is not configured');
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('chat() requires a non-empty messages array');
  }

  const response = await axios.post(
    GROQ_URL,
    { model: GROQ_MODEL, messages, ...DEFAULTS, stream: false },
    { timeout: 30000, headers: buildHeaders() }
  );

  return response?.data?.choices?.[0]?.message?.content ?? '';
}

async function isAvailable() {
  if (!getKey()) return false;
  try {
    // Lightweight ping — tiny payload, short timeout.
    await axios.post(
      GROQ_URL,
      {
        model: GROQ_MODEL,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
        stream: false,
      },
      { timeout: 5000, headers: buildHeaders() }
    );
    return true;
  } catch {
    return false;
  }
}

module.exports = { generate, chat, isAvailable };
