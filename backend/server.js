const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const { v4: uuidv4 } = require("uuid");
const Redis = require("ioredis");
require("dotenv").config();

const app = express();
app.set("trust proxy", true);

app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// ------------------ Redis Setup ------------------
const redis = new Redis(process.env.REDIS_URL);

// Redis Keys
const CURRENT_QUESTION_KEY = "quiz:current_question";
const LEADERBOARD_KEY = "quiz:leaderboard"; // sorted set
const CONNECTED_USERS_KEY = "quiz:connected_users"; // set

// ------------------ Question Generator ------------------
function generateQuestion() {
  const ops = ["+", "-", "*"];
  const a = Math.floor(Math.random() * 50) + 1;
  const b = Math.floor(Math.random() * 50) + 1;
  const c = Math.floor(Math.random() * 30) + 1;

  const op1 = ops[Math.floor(Math.random() * ops.length)];
  const op2 = ops[Math.floor(Math.random() * ops.length)];

  const problem = `(${a} ${op1} ${b}) ${op2} ${c}`;
  const answer = eval(problem);

  return {
    questionId: uuidv4(),
    problem,
    answer
  };
}

// ------------------ Create & Broadcast Question ------------------
async function createNewQuestion() {
  const q = generateQuestion();

  await redis.set(CURRENT_QUESTION_KEY, JSON.stringify(q));

  io.emit("newQuestion", {
    questionId: q.questionId,
    problem: q.problem
  });

  console.log(`NEW QUESTION => ${q.problem} = ${q.answer}`);

  return q;
}

// ------------------ Ensure question exists ------------------
async function ensureQuestionExists() {
  const raw = await redis.get(CURRENT_QUESTION_KEY);

  if (!raw) {
    return await createNewQuestion();
  }

  return JSON.parse(raw);
}

// ------------------ Routes ------------------

// Health check
app.get("/", (req, res) => {
  res.send("Math Quiz Backend Running (Redis Enabled)");
});

// Join user (store in redis)
app.post("/join", async (req, res) => {
  const { username } = req.body;

  if (!username || !username.trim()) {
    return res.status(400).json({ message: "Username required" });
  }

  const userId = uuidv4();

  // Store user as redis hash
  await redis.hset(`quiz:user:${userId}`, {
    username
  });

  // give user record TTL (optional)
  await redis.expire(`quiz:user:${userId}`, 60 * 60 * 24); // 24 hours

  res.json({
    userId,
    username
  });
});

// Get current question
app.get("/question", async (req, res) => {
  const q = await ensureQuestionExists();

  res.json({
    questionId: q.questionId,
    problem: q.problem
  });
});

// Submit answer
app.post("/submit", async (req, res) => {
  const { userId, questionId, answer } = req.body;

  if (!userId || !questionId || answer === undefined) {
    return res.status(400).json({ message: "Missing fields." });
  }

  // fetch user
  const user = await redis.hgetall(`quiz:user:${userId}`);
  if (!user || !user.username) {
    return res.status(400).json({ message: "Invalid user. Please join again." });
  }

  // fetch current question
  const qRaw = await redis.get(CURRENT_QUESTION_KEY);
  if (!qRaw) {
    return res.status(400).json({ message: "No question active." });
  }

  const q = JSON.parse(qRaw);

  // old question
  if (questionId !== q.questionId) {
    return res.json({
      correct: false,
      message: "Too late. Question already changed."
    });
  }

  // wrong answer
  if (Number(answer) !== Number(q.answer)) {
    return res.json({
      correct: false,
      message: "Wrong answer."
    });
  }

  // ------------------ Winner Lock (Concurrency Safe) ------------------
  // Only first correct submission wins.
  const winnerKey = `quiz:winner:${q.questionId}`;

  // NX = only set if doesn't exist
  // EX = auto expire (cleanup)
  const winnerSet = await redis.set(winnerKey, JSON.stringify({ userId, username: user.username }), "NX", "EX", 30);

  if (!winnerSet) {
    return res.json({
      correct: false,
      message: "Someone already won this round."
    });
  }

  // Update leaderboard (sorted set)
  await redis.zincrby(LEADERBOARD_KEY, 1, userId);

  // Broadcast winner
  io.emit("winner", {
    username: user.username,
    problem: q.problem,
    answer: q.answer
  });

  // Generate next question after delay
  setTimeout(async () => {
    await createNewQuestion();
  }, 2000);

  return res.json({
    correct: true,
    message: "Correct! You won!"
  });
});

// Leaderboard
app.get("/leaderboard", async (req, res) => {
  const data = await redis.zrevrange(LEADERBOARD_KEY, 0, 9, "WITHSCORES");

  const leaderboard = [];

  for (let i = 0; i < data.length; i += 2) {
    const userId = data[i];
    const wins = Number(data[i + 1]);

    const user = await redis.hgetall(`quiz:user:${userId}`);
    leaderboard.push({
      userId,
      username: user.username || "Unknown",
      wins
    });
  }

  res.json(leaderboard);
});

// Active Users Count (optional endpoint)
app.get("/active-users", async (req, res) => {
  const count = await redis.scard(CONNECTED_USERS_KEY);
  res.json({ activeUsers: count });
});

// ------------------ Socket.IO ------------------
io.on("connection", async (socket) => {
  console.log("Client connected:", socket.id);

  // track socket in redis
  await redis.sadd(CONNECTED_USERS_KEY, socket.id);

  // send question on connect
  const q = await ensureQuestionExists();

  socket.emit("newQuestion", {
    questionId: q.questionId,
    problem: q.problem
  });

  socket.on("disconnect", async () => {
    console.log("Client disconnected:", socket.id);
    await redis.srem(CONNECTED_USERS_KEY, socket.id);
  });
});

// ------------------ Start Server ------------------
const PORT = process.env.PORT || 8080;

server.listen(PORT, async () => {
  await ensureQuestionExists();
  console.log(`Server running on port ${PORT}`);
});