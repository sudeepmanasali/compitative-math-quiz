const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const { v4: uuidv4 } = require("uuid");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// ------------------ In-memory state ------------------
let currentQuestion = null;
let winnerLocked = false;

// userId -> { username }
const users = new Map();

// userId -> wins
const leaderboard = new Map();

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
function createNewQuestion() {
  currentQuestion = generateQuestion();
  winnerLocked = false;

  console.log(
    `NEW QUESTION => ${currentQuestion.problem} = ${currentQuestion.answer}`
  );

  io.emit("newQuestion", {
    questionId: currentQuestion.questionId,
    problem: currentQuestion.problem
  });
}

// Initialize first question
createNewQuestion();

// ------------------ Routes ------------------

// Health check
app.get("/", (req, res) => {
  res.send("Math Quiz Backend Running");
});

// Join user (generate unique userId)
app.post("/join", (req, res) => {
  const { username } = req.body;

  if (!username || !username.trim()) {
    return res.status(400).json({ message: "Username required" });
  }

  const userId = uuidv4();
  users.set(userId, { username });

  res.json({
    userId,
    username
  });
});

// Get current question
app.get("/question", (req, res) => {
  if (!currentQuestion) createNewQuestion();

  res.json({
    questionId: currentQuestion.questionId,
    problem: currentQuestion.problem
  });
});

// Submit answer
app.post("/submit", (req, res) => {
  const { userId, questionId, answer } = req.body;

  if (!userId || !questionId || answer === undefined) {
    return res.status(400).json({ message: "Missing fields." });
  }

  const user = users.get(userId);
  if (!user) {
    return res.status(400).json({ message: "Invalid user. Please join again." });
  }

  if (!currentQuestion) {
    return res.status(400).json({ message: "No question active." });
  }

  // old question
  if (questionId !== currentQuestion.questionId) {
    return res.json({
      correct: false,
      message: "Too late. Question already changed."
    });
  }

  // already winner
  if (winnerLocked) {
    return res.json({
      correct: false,
      message: "Someone already won this round."
    });
  }

  // incorrect
  if (Number(answer) !== Number(currentQuestion.answer)) {
    return res.json({
      correct: false,
      message: "Wrong answer."
    });
  }

  // Winner found
  winnerLocked = true;

  const wins = leaderboard.get(userId) || 0;
  leaderboard.set(userId, wins + 1);

  io.emit("winner", {
    username: user.username,
    problem: currentQuestion.problem,
    answer: currentQuestion.answer
  });

  setTimeout(() => {
    createNewQuestion();
  }, 2000);

  return res.json({
    correct: true,
    message: "Correct! You won!"
  });
});

// Leaderboard
app.get("/leaderboard", (req, res) => {
  const sorted = Array.from(leaderboard.entries())
    .map(([userId, wins]) => {
      const user = users.get(userId) || { username: "Unknown" };
      return {
        userId,
        username: user.username,
        wins
      };
    })
    .sort((a, b) => b.wins - a.wins)
    .slice(0, 10);

  res.json(sorted);
});

// ------------------ Socket.IO ------------------
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  if (currentQuestion) {
    socket.emit("newQuestion", {
      questionId: currentQuestion.questionId,
      problem: currentQuestion.problem
    });
  }

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

// ------------------ Start Server ------------------
const PORT = process.env.PORT || 8080;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});