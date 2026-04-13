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

let history = [];

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
  const { message, history: clientHistory = [] } = req.body;

  if (!message) return res.json({ reply: "Say something first." });

  try {
    // Use client history if sent, else server history
    let currentHistory = clientHistory.length > 0 ? clientHistory : history;

    const completion = await groq.chat.completions.create({
      messages: [
        { 
          role: "system", 
          content: `You are Donna...` // ← your full system prompt here
        },
        ...currentHistory,
        { role: "user", content: message }
      ],
      model: "llama-3.1-8b-instant",
      temperature: 0.7,
      max_tokens: 700
    });

    const reply = completion.choices?.[0]?.message?.content?.trim() || "I didn't catch that.";

    // Update history
    currentHistory.push({ role: "user", content: message });
    currentHistory.push({ role: "assistant", content: reply });

    if (currentHistory.length > 15) {
      currentHistory = currentHistory.slice(-15);
    }

    history = currentHistory;
    saveHistory();   // ← This saves to file persistently

    res.json({ reply });

  } catch (err) {
    console.error("Error:", err.message);
    res.json({ reply: "Donna had a moment. Try again in a few seconds." });
  }
});

app.listen(port, "0.0.0.0", () => {
  console.log(`✅ Server running on port ${port}`);
});
