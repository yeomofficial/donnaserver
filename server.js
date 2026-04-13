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
let db;

try {
  if (!process.env.FIREBASE_KEY) {
    throw new Error("FIREBASE_KEY is missing");
  }

  const serviceAccount = JSON.parse(process.env.FIREBASE_KEY);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });

  db = admin.firestore();

  console.log("✅ Firebase connected");

} catch (err) {
  console.error("❌ Firebase init error:", err.message);
}

// 🔥 Groq Init
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// 🔥 Chat Route
app.post("/api/chat", async (req, res) => {
  const { message, history: clientHistory = [] } = req.body;

  if (!message) {
    return res.json({ reply: "Please say something." });
  }

  if (!db) {
    return res.json({ reply: "Database is offline. Try again later." });
  }

  try {
    const userId = "sanjay";   // Change this later if you add real user auth

    const docRef = db.collection("users").doc(userId);
    const docSnap = await docRef.get();

    // Load history: prefer from client, fallback to Firestore
    let history = clientHistory.length > 0 ? clientHistory : (docSnap.exists ? (docSnap.data().history || []) : []);

    // Send full context to Groq
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `You are Donna...`   // ← paste your full Donna system prompt here
        },
        ...history,
        { role: "user", content: message }
      ],
      model: "llama-3.1-8b-instant",
      temperature: 0.7,
      max_tokens: 800
    });

    const reply = completion.choices?.[0]?.message?.content?.trim() 
      || "Sorry, I didn't get that. Can you rephrase?";

    // Update history
    history.push({ role: "user", content: message });
    history.push({ role: "assistant", content: reply });

    // Keep only the last 20–30 messages (prevents token limits and high costs)
    if (history.length > 10) {          // ← start with 10
  history = history.slice(-10);
    }

    // Save updated history back to Firebase
    await docRef.set({ history }, { merge: true });

    res.json({ reply });

  } catch (err) {
    console.error("Chat error:", err);
    res.json({ reply: "Donna had an issue. Please try again in a few seconds." });
  }
});

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
    } catch (err) {
  console.error("Full Groq error:", err);   // Check Render Logs for this

  let userMessage = "Donna had a moment. Try again.";

  if (err.message?.includes("429") || err.status === 429) {
    userMessage = "Rate limit reached. Wait 10–20 seconds and try again.";
  } else if (err.message?.includes("context") || err.message?.includes("token")) {
    userMessage = "Conversation too long. Starting fresh...";
    history = [];   // reset history on backend if needed
  } else if (err.message?.includes("API key")) {
    userMessage = "API key issue. Check GROQ_API_KEY on Render.";
  }

  res.json({ reply: userMessage });
    }

// 🚀 Start server
app.listen(port, "0.0.0.0", () => {
  console.log("Server running on port " + port);
});
