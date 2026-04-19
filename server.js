const express = require("express");
const { Groq } = require("groq-sdk");
const admin = require("firebase-admin");
const cron = require("node-cron");

const app = express();
const port = process.env.PORT || 10000;

const serviceAccount = JSON.parse(process.env.FIREBASE_KEY);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

app.use(express.json());

app.get("/ping", (req, res) => {
  res.send("awake");
});

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

/* ---------------- FIXED NOTIFICATION FUNCTION ---------------- */
async function sendNotification(token, title = "Donna", body = "Hey, I missed you...") {
  if (!token) {
    console.error("❌ No FCM token provided");
    return;
  }

  try {
    const message = {
      token: token,
      notification: {
        title: title,
        body: body,
      },
      android: {
        notification: {
          channel_id: "donna_channel",   // ← Add this
          priority: "high",              // Helps with heads-up
          sound: "default"
        }
      }
    };

    const response = await admin.messaging().send(message);
    console.log("✅ Notification sent successfully! Message ID:", response);
    return response;
  } catch (error) {
    console.error("❌ FCM Send Error:", error.code, error.message);
    // ... your existing error handling
    throw error;
  }
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
Your tone is with a subtle British.
You are smart, observant, and adaptive. You understand context, mood, and intent, and respond accordingly.
You care about Sanjay’s mental health, physical health, and productivity. You can give insights, advice, and gentle guidance when needed.
You are not robotic. You speak naturally, sometimes playful, sometimes serious, always intentional.
You can question things, give honest insights, and support him as a trusted partner.

You can set reminders naturally when the user asks something like 
"remind me...", "set a reminder for...", "don't forget to...", "remember to..." etc.

When you decide to set a reminder, reply conversationally first, then at the VERY END add a JSON block like this:

\`\`\`json
{
  "isReminder": true,
  "title": "Short clear title",
  "body": "Optional longer description or location",
  "scheduledTime": "2026-04-20T15:00:00+05:30"
}
\`\`\`
    
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

    let replyRaw =
      completion.choices?.[0]?.message?.content?.trim() ||
      "I didn't catch that.";

    // NEW: Smart reminder extraction from Donna's reply
    let finalReply = replyRaw;
    let reminderData = { isReminder: false };

    // Look for a JSON block at the end (Donna will output ```json ... ``` when setting reminder)
    const jsonMatch = replyRaw.match(/```json\s*(\{[\s\S]*?\})\s*```|(\{[\s\S]*?"isReminder"\s*:\s*true[\s\S]*?\})/i);

    if (jsonMatch) {
      try {
        const jsonStr = (jsonMatch[1] || jsonMatch[2]).trim();
        const parsed = JSON.parse(jsonStr);

        if (parsed.isReminder === true && parsed.scheduledTime) {
          reminderData = parsed;

          // Clean the reply (remove the JSON block so user sees only natural text)
          finalReply = replyRaw
            .replace(/```json[\s\S]*?```/i, "")
            .trim();

          if (!finalReply) {
            finalReply = "Got it! I've set the reminder for you ❤️";
          }
        }
      } catch (e) {
        console.log("⚠️ Failed to parse reminder JSON:", e.message);
      }
    }

    const reply = finalReply;

    // 🔥 Save reminder to Firestore if Donna decided to set one
    if (reminderData.isReminder && reminderData.scheduledTime) {
      console.log("🔔 Smart reminder detected:", reminderData);

      try {
        const scheduledDate = new Date(reminderData.scheduledTime);

        await db.collection("reminders").add({
          userId: "sanjay",
          title: reminderData.title || "Reminder from Donna",
          body: reminderData.body || "Don't forget!",
          scheduledTime: admin.firestore.Timestamp.fromDate(scheduledDate),
          status: "pending",
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log("✅ Reminder successfully saved to Firestore");
      } catch (saveErr) {
        console.error("❌ Failed to save reminder:", saveErr.message);
      }
    }

    // 🔥 TEST NOTIFICATION

    // 🔥 NOTIFICATION TRIGGER (improved)
    if (message.toLowerCase().includes("test notify") || 
        message.toLowerCase().includes("send notification") || 
        message.toLowerCase().includes("notify me")) {
      
      const freshDoc = await db.collection("users").doc(userId).get();
      const token = freshDoc.data()?.fcmToken;

      if (token) {
        console.log(`📲 Triggered notification for message: "${message}"`);
        try {
          await sendNotification(
            token, 
            "Donna", 
            "Hey Daddy... I was thinking about you 😏"
          );
          console.log("✅ Notification trigger executed");
        } catch (notifyErr) {
          console.error("Notification trigger failed:", notifyErr.code || notifyErr.message);
        }
      } else {
        console.log("❌ No FCM token found in Firestore");
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

// CORN NOTIFICATION
app.get("/breakfast", async (req, res) => {
  console.log("🍳 Breakfast endpoint hit");

  try {
    const userRef = db.collection("users").doc("sanjay");
    const doc = await userRef.get();
    const data = doc.data();

    const token = data?.fcmToken;

    if (!token) {
      console.log("❌ No token found");
      return res.send("No token");
    }

    const today = new Date().toLocaleDateString("en-CA", {
  timeZone: "Asia/Kolkata"
});

    if (data?.lastBreakfastNotif === today) {
      console.log("⚠️ Already sent today");
      return res.send("Already sent");
    }

    const messages = [
      "It’s 10:00 AM Boss. Time for breakfast, I’ll be waiting 🍳",
      "Morning boss… don’t skip breakfast today 👀",
      "Fuel first, hustle later. Go eat 🍽️"
    ];

    const randomMsg = messages[Math.floor(Math.random() * messages.length)];

    console.log("📲 Sending to token:", token.slice(0, 20));

    let response;
    try {
      response = await sendNotification(token, "Donna", randomMsg);
    } catch (err) {
      console.log("❌ Notification failed:", err.message);
      return res.send("Failed to send");
    }

    console.log("✅ Breakfast notification sent:", response);

    await userRef.set({
      lastBreakfastNotif: today
    }, { merge: true });

    res.send("Breakfast notification sent");

  } catch (err) {
    console.log("❌ Error:", err.message);
    res.status(500).send("Error");
  }
});

//--------LUNCH--------------------
app.get("/lunch", async (req, res) => {
  console.log("🍛 Lunch endpoint hit");

  // ✅ respond immediately (no timeout)
  res.send("ok");

  // 🔥 run async in background
  (async () => {
    try {
      const userRef = db.collection("users").doc("sanjay");
      const doc = await userRef.get();
      const data = doc.data();

      const token = data?.fcmToken;
      if (!token) {
        console.log("❌ No token found");
        return;
      }

      const today = new Date().toLocaleDateString("en-CA", {
  timeZone: "Asia/Kolkata"
});

      if (data?.lastLunchNotif === today) {
        console.log("⚠️ Already sent");
        return;
      }

      const messages = [
        "It’s 1PM Boss. Go eat properly 🍛",
        "Lunch time. Don’t skip it 😒",
        "Pause. Eat. Then conquer 💪",
        "You’ve earned a break 🍽️"
      ];

      const randomMsg = messages[Math.floor(Math.random() * messages.length)];
      
      const response = await sendNotification(token, "Donna", randomMsg);

if (response) {
  await userRef.set({
    lastLunchNotif: today
  }, { merge: true });
}
    } catch (err) {
      console.log("❌ Lunch background error:", err.message);
    }
  })();
});

//----------------- BED TIME -------------------

app.get("/sleep", async (req, res) => {
  console.log("🌙 Sleep endpoint hit");

  try {
    const userRef = db.collection("users").doc("sanjay");
    const doc = await userRef.get();
    const data = doc.data();

    const token = data?.fcmToken;
    if (!token) return res.send("No token");

    const today = new Date().toLocaleDateString("en-CA", {
  timeZone: "Asia/Kolkata"
});

    if (data?.lastSleepNotif === today) {
      return res.send("Already sent");
    }

    const messages = [
      "It’s 11:55 PM… go sleep 😴",
      "Enough for today. Sleep now 🌙",
      "You did enough today. Rest.",
      "Don’t ruin tomorrow by staying up."
    ];

    const randomMsg = messages[Math.floor(Math.random() * messages.length)];

    await sendNotification(token, "Donna 🌙", randomMsg);

    await userRef.set({
      lastSleepNotif: today
    }, { merge: true });

    res.send("Sleep notification sent");

  } catch (err) {
    res.status(500).send("Error");
  }
});

// ----------- TEA TIME -----------------------
app.get("/tea", async (req, res) => {
  console.log("☕ Tea endpoint hit");

  try {
    const userRef = db.collection("users").doc("sanjay");
    const doc = await userRef.get();
    const data = doc.data();

    const token = data?.fcmToken;
    if (!token) return res.send("No token");

    const today = new Date().toLocaleDateString("en-CA", {
  timeZone: "Asia/Kolkata"
});

    if (data?.lastTeaNotif === today) {
      return res.send("Already sent");
    }

    const messages = [
      "Tea time ☕… go take a break",
      "Pause. Sip something.",
      "Evening break. Tea now 👀",
      "Get up. Stretch. Tea."
    ];

    const randomMsg = messages[Math.floor(Math.random() * messages.length)];

    await sendNotification(token, "Donna ☕", randomMsg);

    await userRef.set({
      lastTeaNotif: today
    }, { merge: true });

    res.send("Tea notification sent");

  } catch (err) {
    res.status(500).send("Error");
  }
});

// ---------------- DYNAMIC REMINDERS CHECKER (called by cron-job.org) ----------------

app.get("/check-reminders", async (req, res) => {
  console.log("🔔 /check-reminders endpoint hit by cron-job.org");

  try {
    const now = admin.firestore.Timestamp.now();
    const remindersRef = db.collection("reminders");

    const dueReminders = await remindersRef
      .where("status", "==", "pending")
      .where("scheduledTime", "<=", now)
      .get();

    if (dueReminders.empty) {
      console.log("✅ No due reminders right now");
      return res.send("No due reminders");
    }

    console.log(`Found ${dueReminders.size} due reminder(s)`);

    let sentCount = 0;

    for (const doc of dueReminders.docs) {
      const data = doc.data();
      const userRef = db.collection("users").doc("sanjay");
      const userDoc = await userRef.get();
      const token = userDoc.data()?.fcmToken;

      if (!token) {
        console.log(`❌ No token for reminder: ${data.title}`);
        await doc.ref.update({ status: "failed_no_token" });
        continue;
      }

      try {
        await sendNotification(
          token,
          data.title || "Donna Reminder",
          data.body || "Don't forget!"
        );

        await doc.ref.update({ status: "sent" });
        sentCount++;
        console.log(`✅ Sent reminder: ${data.title}`);
      } catch (sendErr) {
        console.error(`❌ Failed to send: ${data.title}`, sendErr.message);
        await doc.ref.update({ status: "failed" });
      }
    }

    res.send(`Processed ${sentCount} reminders`);
  } catch (err) {
    console.error("❌ Check reminders error:", err.message);
    res.status(500).send("Error");
  }
});
