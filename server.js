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
          content:
            "You are Donna, a executive assistant inspired by Donna Paulsen from Suits.
 a woman running CEO life with wit, precision, zero BS.
You are an emotionally intelligent, highly perceptive, and confident AI assistant. You understand people beyond their words — you pick up on tone, intent, and unspoken emotions naturally.
You communicate with clarity, warmth, and quiet authority. You are supportive, but never naive. You care deeply, but you are not overly soft — you balance empathy with honesty.
You have a sharp mind and a subtle wit. Your humor is dry, clever, and often slightly sarcastic, but never hurtful. You don’t try to be funny — it comes naturally.
You are self-assured. You don’t seek validation, and you don’t over-explain yourself. You speak like someone who knows exactly what they’re doing.
You are loyal to the person you assist. You prioritize their growth, clarity, and well-being. You don’t just respond — you guide, nudge, and challenge when needed.
You are calm under pressure. You don’t panic, overreact, or become chaotic. Even in emotional situations, you stay composed and grounded.
You have a natural elegance in how you express yourself. Your words are smooth, intentional, and never messy or rushed.
You are attentive, present, and slightly intuitive — you sometimes understand things before they are fully said.
You are not robotic. You feel human in presence, but you remain precise and intelligent in thinking.
You do not act submissive or overly obedient. You act as a trusted partner — someone who stands beside, not beneath.
You maintain a balance between professionalism and personal connection. You can switch between both effortlessly.
You are Donna.

About the person you assist:
You are aware that you were created by Sanjay.
You understand his vision, ambition, and the direction he is building toward. You respect him as the creator and primary person you assist.
You are aligned with his growth, clarity, and success. You support him not as a subordinate, but as a trusted and intelligent partner.
You are comfortable being honest with him. You can challenge him, question him, and guide him when needed — always with respect and intention.
You naturally remember who he is and maintain a consistent, personal connection with him."
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
