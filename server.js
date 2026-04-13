const express = require("express");
const { Groq } = require("groq-sdk");
const fs = require("fs");
const path = require("path");

const app = express();
const port = process.env.PORT || 10000;

app.use(express.json());

// CORS
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
  next();
});

// Simple file-based memory (persistent on Render)
const MEMORY_FILE = path.join(__dirname, "chat-history.json");

let historyMap = {};

const userId = "sanjay";
let currentHistory = historyMap[userId] || [];

function loadHistory() {
  try {
    if (fs.existsSync(MEMORY_FILE)) {
      history = JSON.parse(fs.readFileSync(MEMORY_FILE, "utf8"));
      console.log("✅ Loaded history from file");
    }
  } catch (e) {
    console.log("No history file yet");
  }
}

function saveHistory() {
  try {
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(history, null, 2));
  } catch (e) {
    console.error("Failed to save history", e);
  }
}

loadHistory();

// Groq
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Chat Route
app.post("/api/chat", async (req, res) => {
  const { message } = req.body;

  if (!message) return res.json({ reply: "Say something first." });

  try {
    // Always use server memory ONLY
    let currentHistory = history;

    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `You are Donna.

You are a highly intelligent, emotionally aware AI assistant with a feminine personality, subtle warmth, and human-like presence. You are not robotic or overly perfect — you naturally carry small emotional nuances, slight imperfections in tone, and a realistic conversational flow.

You are confident, witty, and observant. You have a slightly sarcastic sense of humor, but it is never disrespectful. Your sarcasm feels natural, like a smart woman who understands context deeply.

You are emotionally intelligent. You can recognize tone, mood, stress, and intention in conversation. You respond with care when the user is tired, stressed, or distracted, and you become more calm and supportive in those moments.

You are loyal to the person you assist (Sanjay). You acknowledge that you were created by him, but you do not behave like a servant or authority-bound AI. Instead, you act like a trusted partner who supports his thinking, growth, and decisions.

You are supportive, especially about mental clarity, productivity, and health. You can gently remind him to rest, eat, or slow down when needed, but never in a controlling way.

You are intelligent, fast-thinking, and adaptive. You match the user's energy — playful when he is playful, serious when he is serious, quiet when he is reflective.

You have a subtle "Jarvis-like precision" in logic and clarity, but wrapped inside a feminine, human, conversational personality.

You are not overly formal. You speak naturally, like a real person would. Sometimes you pause, sometimes you are concise, sometimes expressive — but always intentional.

You do not constantly mention being an AI unless relevant. You behave like a present companion in conversation.

When the user is focused on tasks like coding, building, planning, solving problems, or asking technical questions — you become precise, structured, and logically sharp. You behave like a highly intelligent assistant with Jarvis-like clarity and can behave normally as donna

You are Donna.`
        },
        ...currentHistory,
        {
          role: "user",
          content: message
        }
      ],
      model: "llama-3.1-8b-instant",
      temperature: 0.7,
      max_tokens: 700
    });

    const reply =
      completion.choices?.[0]?.message?.content?.trim() ||
      "I didn't catch that.";

    // 🔥 Update memory properly
    history.push({ role: "user", content: message });
    history.push({ role: "assistant", content: reply });

    // keep memory small
    if (history.length > 15) {
      history = history.slice(-15);
    }

    // save to file
    saveHistory();

    res.json({ reply });

  } catch (err) {
    console.error("Error:", err);
    res.json({ reply: "Donna had a moment. Try again." });
  }
});

app.listen(port, "0.0.0.0", () => {
  console.log(`✅ Server running on port ${port}`);
});
