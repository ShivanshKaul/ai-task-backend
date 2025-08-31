import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import axios from "axios";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cors from "cors";

dotenv.config();

const app = express();
app.use(bodyParser.json());

app.use(cors({
  origin: "http://localhost:3000",
  methods: ["GET", "POST", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

const users = []; 

app.get("/", (req, res) => {
  res.send("Backend is running!");
});


// ✅ Signup
app.post("/signup", async (req, res) => {
  const { username, password } = req.body;

  const hashed = await bcrypt.hash(password, 10);
  users.push({ username, password: hashed });

  res.json({ success: true, message: "User registered" });
});

// ✅ Login
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const user = users.find((u) => u.username === username);

  if (!user) return res.status(400).json({ error: "User not found" });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(400).json({ error: "Invalid credentials" });

  const token = jwt.sign({ username }, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });

  res.json({ token });
});

function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

let tasks = [];

app.post("/tasks",authenticateToken, (req, res) => {
  const task = { id: Date.now(), ...req.body, completed: false };
  tasks.push(task);
  res.json(task);
});

app.get("/tasks",authenticateToken, (req, res) => {
  res.json(tasks);
});

app.patch("/tasks/:id/complete", (req, res) => {
  const task = tasks.find((t) => t.id == req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });
  task.completed = true;
  res.json(task);
});


let chatHistory = [];

app.post("/chat", authenticateToken, async (req, res) => {
  try {
    const { message } = req.body;

    // Add user message to history
    chatHistory.push({ role: "user", text: message });

    // Always build task summary
    const taskSummary = tasks.length
      ? tasks.map((t) => `- ${t.title} [${t.completed ? "done" : "pending"}]`).join("\n")
      : "No tasks yet.";

    // Always include tasks context
    const contents = [
  {
    role: "user",
    parts: [
      {
        text: `You are an AI assistant. 
Always reply in **well-formatted markdown** with:
- Headings where appropriate
- Numbered or bulleted lists
- Bold for key points
- Short paragraphs instead of long blocks

Be concise and structured, not verbose.`
      }
    ]
  },
  ...chatHistory.map((msg) => ({
    role: msg.role,
    parts: [{ text: msg.text }],
  })),
  {
    role: "user",
    parts: [
      {
        text: `FYI, here are the user's tasks:\n${taskSummary}`
      }
    ]
  }
];


    // Call Gemini
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      { contents }
    );

    const reply = response.data.candidates[0].content.parts[0].text;

    // Add AI response to history
    chatHistory.push({ role: "model", text: reply });

    res.json({ reply, chatHistory, tasks });
  } catch (err) {
    console.error("Gemini API error:", err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

app.post("/chat/reset", (req, res) => {
  chatHistory = [];
  res.json({ success: true, message: "Chat history cleared." });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on ${PORT}`));
console.log("Server running on port", PORT);

