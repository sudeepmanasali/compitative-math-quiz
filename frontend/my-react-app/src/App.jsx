import { useEffect, useState } from "react";
import { api } from "./api";
import { io } from "socket.io-client";

const socket = io(import.meta.env.VITE_API_BASE);

export default function App() {
  const [username, setUsername] = useState("");
  const [joined, setJoined] = useState(false);

  const [question, setQuestion] = useState(null);
  const [answer, setAnswer] = useState("");

  const [message, setMessage] = useState("");
  const [leaderboard, setLeaderboard] = useState([]);

  async function loadLeaderboard() {
    const res = await api.get("/leaderboard");
    console.log(res)
    setLeaderboard(res.data);
  }

  async function submitAnswer() {
    if (!answer.trim()) return;
    if (!question) return;

    try {
      const res = await api.post("/submit", {
        username,
        questionId: question.questionId,
        answer
      });

      setMessage(res.data.message);
      setAnswer("");
      loadLeaderboard();
    } catch (err) {
      setMessage("Server error.");
    }
  }

  useEffect(() => {
    loadLeaderboard();

    socket.on("newQuestion", (q) => {
      setQuestion(q);
      setMessage("");
    });

    socket.on("winner", (data) => {
      setMessage(
        `Winner: ${data.username} | ${data.problem} = ${data.answer}`
      );
      loadLeaderboard();
    });

    return () => {
      socket.off("newQuestion");
      socket.off("winner");
    };
  }, []);

  if (!joined) {
    return (
      <div style={styles.container}>
        <h1 style={styles.title}>Competitive Math Quiz</h1>
        <p style={styles.subtitle}>
          Multiple users compete live. First correct answer wins.
        </p>

        <div style={{ marginTop: 20 }}>
          <input
            style={styles.input}
            placeholder="Enter username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />

          <button
            style={styles.button}
            onClick={() => {
              if (!username.trim()) return;
              setJoined(true);
            }}
          >
            Join
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Competitive Math Quiz</h1>

      <p style={{ marginTop: 10 }}>
        Logged in as: <b>{username}</b>
      </p>

      <div style={styles.card}>
        <h2>Current Problem</h2>

        {question ? (
          <h1 style={styles.problemText}>{question.problem}</h1>
        ) : (
          <p>Loading question...</p>
        )}

        <div style={{ marginTop: 15 }}>
          <input
            style={styles.input}
            placeholder="Enter answer"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
          />

          <button style={styles.button} onClick={submitAnswer}>
            Submit
          </button>
        </div>

        <p style={styles.message}>{message}</p>
      </div>

      <div style={styles.card}>
        <h2>Leaderboard</h2>

        {leaderboard.length === 0 ? (
          <p>No winners yet.</p>
        ) : (
          <ul>
            {leaderboard.map((u, idx) => (
              <li key={idx}>
                {u.username} — {u.wins} wins
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    fontFamily: "Arial",
    padding: 30,
    maxWidth: 700,
    margin: "0 auto"
  },
  title: {
    fontSize: 36,
    marginBottom: 0
  },
  subtitle: {
    marginTop: 5,
    color: "#555"
  },
  card: {
    marginTop: 20,
    padding: 20,
    border: "1px solid #ddd",
    borderRadius: 10
  },
  problemText: {
    fontSize: 42,
    marginTop: 10,
    marginBottom: 10
  },
  input: {
    padding: 10,
    fontSize: 16,
    width: 200
  },
  button: {
    marginLeft: 10,
    padding: "10px 16px",
    fontSize: 16,
    cursor: "pointer"
  },
  message: {
    marginTop: 15,
    fontWeight: "bold"
  }
};