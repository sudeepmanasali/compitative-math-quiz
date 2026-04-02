// // backend/server.js
// import express from "express";
// import cors from "cors";
// import http from "http";
// import { Server } from "socket.io";
// import { v4 as uuidv4 } from "uuid";

const express = require("express");
const cors = require("cors");
const http = require("http");
const {Server} = require("socket.io")
const {v4}= require("uuid") 



const app = express();
app.use(cors()); 
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// ------------------ In-memory state ------------------
// NOTE: This works only for a single backend instance.
// If the server restarts or scales horizontally, state is lost.
let currentQuestion = null;
let winnerLocked = false;

const leaderboard = new Map(); // username -> wins

// ------------------ Question Generator ------------------
function generateQuestion() {
  const ops = ["+", "-", "*"];
  const a = Math.floor(Math.random() * 50) + 1;
  const b = Math.floor(Math.random() * 50) + 1;
  const c = Math.floor(Math.random() * 30) + 1;

  const op1 = ops[Math.floor(Math.random() * ops.length)];
  const op2 = ops[Math.floor(Math.random() * ops.length)];

  const problem = `(${a} ${op1} ${b}) ${op2} ${c}`;
  const answer = eval(problem); // safe because we generate the string ourselves

  return {
    questionId: v4(),
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

// Get current question
app.get("/question", (req, res) => {
  if (!currentQuestion) {
    createNewQuestion();
  }

  res.json({
    questionId: currentQuestion.questionId,
    problem: currentQuestion.problem
  });
});

// Submit answer
app.post("/submit", (req, res) => {
  const { username, questionId, answer } = req.body;

  if (!username || !questionId || answer === undefined) {
    return res.status(400).json({ message: "Missing fields." });
  }

  if (!currentQuestion) {
    return res.status(400).json({ message: "No question active." });
  }

  // If user answered an old question
  if (questionId !== currentQuestion.questionId) {
    return res.json({
      correct: false,
      message: "Too late. Question already changed."
    });
  }

  // If someone already won this round
  if (winnerLocked) {
    return res.json({
      correct: false,
      message: "Someone already won this round."
    });
  }

  // Check answer
  if (Number(answer) !== Number(currentQuestion.answer)) {
    return res.json({
      correct: false,
      message: "Wrong answer."
    });
  }

  // Winner found (first correct wins)
  winnerLocked = true;

  // Update leaderboard
  const currentWins = leaderboard.get(username) || 0;
  leaderboard.set(username, currentWins + 1);

  // Broadcast winner
  io.emit("winner", {
    username,
    problem: currentQuestion.problem,
    answer: currentQuestion.answer
  });

  // Generate next question after short delay
  setTimeout(() => {
    createNewQuestion();
  }, 2000);

  return res.json({
    correct: true,
    message: "Correct! You won!"
  });
});

// Get leaderboard
app.get("/leaderboard", (req, res) => {
  const sorted = Array.from(leaderboard.entries())
    .map(([username, wins]) => ({ username, wins }))
    .sort((a, b) => b.wins - a.wins)
    .slice(0, 10);

  res.json(sorted);
});

// ------------------ Socket.IO ------------------
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  // Send current question to newly connected user
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