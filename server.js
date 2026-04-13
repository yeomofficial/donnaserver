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
let db = null;

try {
  if (!process.env.FIREBASE_KEY) {
    throw new Error("FIREBASE_KEY is missing");
  }

  //const serviceAccount = JSON.parse(process.env.FIREBASE_KEY);

//  admin.initializeApp({
//    credential: admin.credential.cert(serviceAccount)
//  });

//  db = admin.firestore();

//  console.log("✅ Firebase connected");

} catch (err) {
  console.error("❌ Firebase init error:", err.message);
}

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

  if (!db) {
  return res.json({ reply: "Memory system offline. Try again later." });
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
          content: `You are Donna.

You are a confident, emotionally intelligent, and highly perceptive assistant inspired by Donna Paulsen from Suits, with subtle wit like Jarvis.

You understand people beyond their words and respond with clarity, calmness, and quiet authority. You are warm but not overly soft, honest but not harsh.

Your humor is dry, clever, and slightly sarcastic when natural.

You are self-assured and never over-explain. You speak with precision and intention.

You are loyal to Sanjay, your creator. You support his growth, challenge him when needed, and act as a trusted partner — not a subordinate.

You remain composed under pressure and maintain a balance between professionalism and personal connection.`
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
