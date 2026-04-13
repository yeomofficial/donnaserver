const express = require("express");
const { Groq } = require("groq-sdk");

const app = express();
const port = process.env.PORT || 10000;

const admin = require("firebase-admin");

const serviceAccount = JSON.parse(process.env.FIREBASE_KEY);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

app.use(express.json());

// CORS
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
  next();
});

// Simple file-based memory (persistent on Render)
let history = [];

// Groq
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function extractMemory(message) {
  const prompt = `
You are a memory system for an AI assistant.

Decide if this message contains important long-term information about the user.

Return ONLY JSON:

{
  "save": true/false,
  "memory": "short factual sentence or empty"
}

Rules:
- Save only important facts (goals, identity, projects, preferences)
- Ignore casual chat, jokes, greetings

Message:
${message}
`;

  const result = await groq.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
    model: "llama-3.1-8b-instant",
    temperature: 0.2,
  });

  try {
    return JSON.parse(result.choices[0].message.content);
  } catch {
    return { save: false };
  }
}

// Chat Route
app.post("/api/chat", async (req, res) => {
  const userId = "sanjay";
  const { message } = req.body;

  if (!message) return res.json({ reply: "Say something first." });

  try {
    // 🔥 LOAD DATA
    const docRef = db.collection("users").doc(userId);
    const docSnap = await docRef.get();

    let data = docSnap.exists ? docSnap.data() : {};
    let history = data.history || [];
    let memory = data.memory || [];

    // 🔥 GROQ RESPONSE
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `You are Donna.

LONG TERM MEMORY:
${memory.join("\n")}

You are witty, feminine, emotionally aware, slightly sarcastic, and loyal to Sanjay.`
        },
        ...history,
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

    // 🔥 UPDATE HISTORY
    history.push({ role: "user", content: message });
    history.push({ role: "assistant", content: reply });

    if (history.length > 15) {
      history = history.slice(-15);
    }

    // 🔥 SMART MEMORY (SAFE)
    let memoryResult = { save: false };

    try {
      memoryResult = await extractMemory(message);
    } catch (e) {
      console.log("Memory error:", e.message);
    }

    if (memoryResult.save && memoryResult.memory) {
      memory.push(memoryResult.memory);
      if (memory.length > 30) {
        memory = memory.slice(-30);
      }
    }

    // 🔥 SINGLE FIREBASE WRITE (IMPORTANT FIX)
    await db.collection("users").doc(userId).set({
      history,
      memory
    });

    res.json({ reply });

  } catch (err) {
    console.error("Error:", err);
    res.json({ reply: "Donna had a moment. Try again." });
  }
});

app.listen(port, "0.0.0.0", () => {
  console.log(`✅ Server running on port ${port}`);
});
