const express = require("express");
const { Groq } = require("groq-sdk");
const admin = require("firebase-admin");

const app = express();
const port = process.env.PORT || 10000;

app.use(express.json());

// ✅ CORS
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
  next();
});

// 🔥 Firebase Init (from ENV)
const serviceAccount = JSON.parse(process.env.FIREBASE_KEY);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// 🔥 Groq Init
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// 🔥 Chat Route
app.post("/api/chat", async (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.json({ reply: "Say something first." });
  }

  try {
    const userId = "sanjay"; // simple for now

    // 🧠 1. Load memory from Firebase
    const docRef = db.collection("users").doc(userId);
    const docSnap = await docRef.get();

    let history = [];

    if (docSnap.exists) {
      history = docSnap.data().history || [];
    }

    // 🧠 2. Send to Groq
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content:
            "You are Donna. Confident, emotionally intelligent, witty, slightly sarcastic, loyal to Sanjay."
        },
        ...history,
        {
          role: "user",
          content: message
        }
      ],
      model: "llama-3.1-8b-instant",
    });

    const reply =
      completion.choices?.[0]?.message?.content || "No response";

    // 🧠 3. Save memory back
    history.push({ role: "user", content: message });
    history.push({ role: "assistant", content: reply });

    // limit memory
    if (history.length > 20) {
      history = history.slice(-20);
    }

    await db.collection("users").doc(userId).set({
      history
    });

    // ✅ Send response
    res.json({ reply });

  } catch (err) {
    console.error("Error:", err);
    res.json({ reply: "Donna had a moment. Try again." });
  }
});

// 🚀 Start server
app.listen(port, "0.0.0.0", () => {
  console.log("Server running on port " + port);
});
