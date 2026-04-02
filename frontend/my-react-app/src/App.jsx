import { useEffect, useState } from "react";
import { api } from "./api";
import { io } from "socket.io-client";

const socket = io(import.meta.env.VITE_API_BASE);

export default function App() {
  const [userId, setUserId] = useState(() => localStorage.getItem("userId"));
  const [username, setUsername] = useState(() => localStorage.getItem("username") || "");
  const [joined, setJoined] = useState(() => {
    return !!localStorage.getItem("userId") && !!localStorage.getItem("username");
  });

  const [question, setQuestion] = useState(null);
  const [answer, setAnswer] = useState("");

  const [message, setMessage] = useState("");
  const [leaderboard, setLeaderboard] = useState([]);

  const logout = () => {
    localStorage.removeItem("userId");
    localStorage.removeItem("username");
    setUserId(null);
    setUsername("");
    setJoined(false)
  }

  async function loadLeaderboard() {
    try {
      const res = await api.get("/leaderboard");
      setLeaderboard(res.data);
    } catch (err) {
      console.log(err);
      logout();
    }

  }

  async function joinGame() {
    if (!username.trim()) return;

    try {
      const res = await api.post("/join", { username });

      setUserId(res.data.userId);
      setJoined(true);

      localStorage.setItem("userId", res.data.userId);
      localStorage.setItem("username", res.data.username);

      setMessage("");
      loadLeaderboard();
    } catch (err) {
      console.log(err)
      setMessage("Join failed.");
    }
  }

  async function submitAnswer() {
    if (!answer.trim()) return;
    if (!question) return;
    if (!userId) return;

    try {
      const res = await api.post("/submit", {
        userId,
        questionId: question.questionId,
        answer
      });

      setMessage(res.data.message);
      loadLeaderboard();
    } catch (err) {
      console.log(err)
      setMessage("Server error.");
    } finally {
      setAnswer("");
    }
  }

  useEffect(() => {
    const fetchData = async () => {
      await loadLeaderboard();
    };

    fetchData();

    socket.on("newQuestion", (q) => {
      setQuestion(q);
      setMessage("");
      setAnswer("");
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


        </div>

        <div style={{ marginTop: 20 }}>
          <button style={styles.button} onClick={joinGame}>
            Join
          </button>


        </div>



        <p style={styles.message}>{message}</p>
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


        </div>
        <div style={{ marginTop: 12 }}>
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
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Rank</th>
                <th style={styles.th}>Username</th>
                <th style={styles.th}>Wins</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((u, idx) => (
                <tr key={u.userId}>
                  <td style={styles.td}>{idx + 1}</td>
                  <td style={styles.td}>{u.username}</td>
                  <td style={styles.td}>{u.wins}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <button
        style={{ ...styles.button, marginTop: 20 }}
        onClick={() => {
          logout();
          window.location.reload();
        }}
      >
        Logout
      </button>
    </div>
  );
}

const styles = {
  container: {
    fontFamily: "Arial",
    padding: 30,
    maxWidth: 800,
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
    width: 220
  },
  button: {
    padding: "10px 16px",
    fontSize: 16,
    cursor: "pointer"
  },
  message: {
    marginTop: 15,
    fontWeight: "bold"
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    marginTop: 10
  },
  th: {
    border: "1px solid #ddd",
    padding: 10,
    textAlign: "left",
    background: "#f5f5f5"
  },
  td: {
    border: "1px solid #ddd",
    padding: 10
  }
};