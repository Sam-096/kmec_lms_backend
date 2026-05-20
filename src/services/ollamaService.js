const axios = require("axios");

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2";

// ── Core text generation ───────────────────────────────────
async function generate(prompt, systemPrompt = "") {
  const response = await axios.post(
    `${OLLAMA_URL}/api/generate`,
    {
      model: OLLAMA_MODEL,
      prompt,
      system: systemPrompt,
      stream: false,
      options: {
        temperature: 0.7,
        top_p: 0.9,
        num_predict: 150, // limit output tokens → faster
        num_ctx: 1024, // smaller context window → faster
        repeat_penalty: 1.1,
      },
    },
    { timeout: 30000 },
  );

  return response.data.response;
}

// ── Chat with message history ──────────────────────────────
async function chat(messages) {
  const response = await axios.post(
    `${OLLAMA_URL}/api/chat`,
    {
      model: OLLAMA_MODEL,
      messages,
      stream: false,
      options: {
        temperature: 0.7,
        num_predict: 150,
        num_ctx: 1024,
      },
    },
    { timeout: 30000 },
  );

  return response.data.message.content;
}

// ── Health check ───────────────────────────────────────────
async function isAvailable() {
  try {
    await axios.get(`${OLLAMA_URL}/api/tags`, { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

// ✅ Named exports — must match what aiController imports
module.exports = { generate, chat, isAvailable };
