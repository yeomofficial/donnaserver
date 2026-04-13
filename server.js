const express = require("express");
const { Groq } = require("groq-sdk");
const admin = require("firebase-admin");

const app = express();
const port = process.env.PORT || 10000;

const serviceAccount = JSON.parse(process.env.FIREBASE_KEY);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
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

// Groq
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

/* ---------------- MEMORY FUNCTION ---------------- */
async function extractMemory(message) {
  try {
    console.log("🧠 Memory check started");

    const result = await groq.chat.completions.create({
      messages: [
        {
          role: "user",
          content: `
Return ONLY JSON:
{
  "save": true/false,
  "memory": "short fact or empty"
}

Message:
${message}
          `,
        },
      ],
      model: "llama-3.1-8b-instant",
      temperature: 0.2,
    });

    let text = result.choices?.[0]?.message?.content || "";
    console.log("🧠 Raw memory response:", text);

    text = text.replace(/```json/g, "").replace(/```/g, "").trim();

    if (!text.includes("{") || !text.includes("}")) {
      return { save: false };
    }

    return JSON.parse(text);
  } catch (err) {
    console.log("❌ Memory error:", err.message);
    return { save: false };
  }
}

/* ---------------- CHAT ROUTE ---------------- */
app.post("/api/chat", async (req, res) => {
  const userId = "sanjay";
  const { message } = req.body;

  console.log("📩 Incoming message:", message);

  if (!message) return res.json({ reply: "Say something first." });

  try {
    console.log("1️⃣ Loading Firebase data");

    const docRef = db.collection("users").doc(userId);
    const docSnap = await docRef.get();

    let data = docSnap.exists ? docSnap.data() : {};
    let history = Array.isArray(data.history) ? data.history : [];
    let memory = Array.isArray(data.memory) ? data.memory : [];

    console.log("2️⃣ History:", history.length);
    console.log("3️⃣ Memory:", memory.length);

    // 🔥 REDUCED SYSTEM PROMPT (IMPORTANT FIX)
    const systemPrompt = `
You are Donna.

LONG TERM MEMORY:
${memory.slice(-5).join("\n")}

You are smart, witty, slightly sarcastic, emotionally aware, and loyal to Sanjay.
Keep responses natural and not robotic.
    `;

    console.log("4️⃣ Calling Groq");

    const completion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        ...history.slice(-6), // 🔥 REDUCED HISTORY
        { role: "user", content: message },
      ],
      model: "llama-3.1-8b-instant",
      temperature: 0.7,
      max_tokens: 500,
    });

    console.log("5️⃣ Groq response received");

    const reply =
      completion.choices?.[0]?.message?.content?.trim() ||
      "I didn't catch that.";

    // 🔥 UPDATE HISTORY
    history.push({ role: "user", content: message });
    history.push({ role: "assistant", content: reply });

    history = history.slice(-10); // keep small

    console.log("6️⃣ Running memory extraction");

    let memoryResult = { save: false };

    try {
      memoryResult = await extractMemory(message);
    } catch (e) {
      console.log("Memory extraction failed safely");
    }

    if (memoryResult.save && memoryResult.memory) {
      memory.push(memoryResult.memory);
      memory = memory.slice(-20);
      console.log("🧠 Memory saved:", memoryResult.memory);
    }

    console.log("7️⃣ Saving to Firebase");

    await db.collection("users").doc(userId).set({
      history,
      memory,
    });

    console.log("✅ Done");

    res.json({ reply });
  } catch (err) {
    console.error("🔥 FULL ERROR:", err);
    res.json({ reply: "Donna had a moment. Try again." });
  }
});

/* ---------------- START SERVER ---------------- */
app.listen(port, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${port}`);
});
