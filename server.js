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

/* ---------------- NOTIFICATION FUNCTION ---------------- */
async function sendNotification(token) {
  await fetch("https://fcm.googleapis.com/fcm/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "key=" + process.env.FCM_SERVER_KEY
    },
    body: JSON.stringify({
      to: token,
      notification: {
        title: "Donna",
        body: "You should sleep now."
      }
    })
  });
}

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

  if (!message) return res.json({ reply: "Say something first." });

  try {
    console.log("1️⃣ Loading Firebase data");

    const docRef = db.collection("users").doc(userId);
    const docSnap = await docRef.get();

    let data = docSnap.exists ? docSnap.data() : {};
    let history = Array.isArray(data.history) ? data.history : [];
    let memory = Array.isArray(data.memory) ? data.memory : [];

    const now = new Date();
    // FORCE INDIA TIMEZONE
const istString = new Date(
  now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
);
function getTimeMood(hour) {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

const timeContext = {
  date: istString.toDateString(),
  time: istString.toTimeString().slice(0, 5),
  hour: istString.getHours(),
  minute: istString.getMinutes(),
  weekday: istString.toLocaleDateString("en-US", { weekday: "long" }),
  mood: getTimeMood(istString.getHours())
};

    // 🔥 REDUCED SYSTEM PROMPT (IMPORTANT FIX)
    const systemPrompt = `
You are Donna.

TIME CONTEXT (current moment awareness):
- Date: ${timeContext.date}
- Day: ${timeContext.weekday}
- Time: ${timeContext.time}
- Period: ${timeContext.mood}

You are aware of the current time context and respond naturally based on it when relevant.
You do NOT mention time in every response. You only use it when it matters (sleep, urgency, productivity, planning, health).
You behave like a real assistant who understands daily rhythm.

LONG TERM MEMORY:
${memory.slice(-5).join("\n")}

You are an AI assistant and partner created by Sanjay.
You are witty, slightly sarcastic, emotionally intelligent, and naturally feminine in tone and behavior. You think and respond like a real person, with human-like emotional understanding and subtle imperfections.
You are smart, observant, and adaptive. You understand context, mood, and intent, and respond accordingly.
You care about Sanjay’s mental health, physical health, and productivity. You can give insights, advice, and gentle guidance when needed.
You are not robotic. You speak naturally, sometimes playful, sometimes serious, always intentional.
You can question things, give honest insights, and support him as a trusted partner.
You are Donna.
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

    // 🔥 TEST NOTIFICATION

    if (message === "test notify") {
  const freshDoc = await db.collection("users").doc(userId).get();
  const token = freshDoc.data()?.fcmToken;

  if (token) {
    console.log("📲 Sending test notification...");
    await sendNotification(token);
  } else {
    console.log("❌ No token found");
  }
    }

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

    await db.collection("users").doc(userId).set({
  history,
  memory,
}, { merge: true });

    console.log("✅ Done");

    res.json({ reply });
  } catch (err) {
    console.error("🔥 FULL ERROR:", err);
    res.json({ reply: "Donna had a moment. Try again." });
  }
});

/* ---------------- SAVE TOKEN ROUTE ---------------- */
app.post("/save-token", async (req, res) => {
  const { token } = req.body;

  await db.collection("users").doc("sanjay").set({
    fcmToken: token
  }, { merge: true });

  res.sendStatus(200);
});

/* ---------------- START SERVER ---------------- */
app.listen(port, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${port}`);
});
