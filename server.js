const express = require("express");
const { Groq } = require("groq-sdk");

const app = express();
const port = process.env.PORT || 10000;

app.use(express.json());

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
  next();
});

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

app.post("/api/chat", async (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.json({ reply: "Say something first." });
  }

  try {
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content:
            "You are Donna. Confident, emotionally intelligent, witty, slightly sarcastic, loyal to Sanjay."
        },
        {
          role: "user",
          content: message
        }
      ],
      model: "llama-3.1-8b-instant",
    });

    const reply =
      completion.choices?.[0]?.message?.content || "No response";

    res.json({ reply });

  } catch (err) {
    console.log(err);
    res.json({ reply: "Error talking to Donna." });
  }
});

app.listen(port, "0.0.0.0", () => {
  console.log("Server running");
});
