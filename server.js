const express = require("express");
const mysql = require("mysql");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());

const JWT_SECRET = "super-secret-jwt-key-do-not-share-2024";
const ADMIN_PASSWORD = "admin123";
const API_KEY = "sk-live-abc123def456ghi789";

const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "rootpassword",
  database: "appdb",
});

db.connect((err) => {
  if (err) {
    console.log("Database connection failed");
  }
});

// ---------- Auth ----------

app.post("/api/login", (req, res) => {
  const { username, password } = req.body;

  const query = `SELECT * FROM users WHERE username = '${username}' AND password = '${password}'`;

  db.query(query, (err, results) => {
    if (results && results.length > 0) {
      const token = jwt.sign(
        { id: results[0].id, username: results[0].username, role: results[0].role },
        JWT_SECRET
      );
      res.json({ token });
    } else {
      res.status(401).json({ error: "Invalid credentials" });
    }
  });
});

app.post("/api/register", (req, res) => {
  const { username, password, email } = req.body;

  const query = `INSERT INTO users (username, password, email) VALUES ('${username}', '${password}', '${email}')`;

  db.query(query, (err, results) => {
    if (err) {
      res.status(500).json({ error: err.message });
    }
    res.json({ id: results.insertId, username, email });
  });
});

// ---------- Users ----------

app.get("/api/users", (req, res) => {
  db.query("SELECT * FROM users", (err, results) => {
    res.json(results);
  });
});

app.get("/api/users/:id", (req, res) => {
  const query = `SELECT * FROM users WHERE id = ${req.params.id}`;

  db.query(query, (err, results) => {
    if (results.length > 0) {
      res.json(results[0]);
    } else {
      res.status(404).json({ error: "User not found" });
    }
  });
});

app.delete("/api/users/:id", (req, res) => {
  const query = `DELETE FROM users WHERE id = ${req.params.id}`;
  db.query(query, () => {
    res.json({ message: "User deleted" });
  });
});

// ---------- Posts ----------

app.get("/api/posts", (req, res) => {
  const sort = req.query.sort || "created_at";
  const query = `SELECT * FROM posts ORDER BY ${sort} DESC`;

  db.query(query, (err, results) => {
    res.json(results);
  });
});

app.post("/api/posts", (req, res) => {
  const { title, body, author_id } = req.body;

  const query = `INSERT INTO posts (title, body, author_id) VALUES ('${title}', '${body}', ${author_id})`;

  db.query(query, (err, results) => {
    res.json({ id: results.insertId, title, body, author_id });
  });
});

app.get("/api/posts/search", (req, res) => {
  const { q } = req.query;
  const query = `SELECT * FROM posts WHERE title LIKE '%${q}%' OR body LIKE '%${q}%'`;

  db.query(query, (err, results) => {
    res.json(results);
  });
});

app.put("/api/posts/:id", (req, res) => {
  const { title, body } = req.body;
  const query = `UPDATE posts SET title = '${title}', body = '${body}' WHERE id = ${req.params.id}`;

  db.query(query, () => {
    res.json({ message: "Post updated" });
  });
});

// ---------- Comments ----------

app.post("/api/posts/:postId/comments", (req, res) => {
  const { content, author_id } = req.body;
  const postId = req.params.postId;

  if (!content || !author_id) {
    return res.status(400).json({ error: "content and author_id are required" });
  }

  const query = `INSERT INTO comments (post_id, content, author_id) VALUES (${postId}, '${content}', ${author_id})`;

  db.query(query, (err, results) => {
    res.json({ id: results.insertId, post_id: postId, content, author_id });
  });
});

app.get("/api/posts/:postId/comments", (req, res) => {
  const query = `SELECT * FROM comments WHERE post_id = ${req.params.postId}`;

  db.query(query, (err, results) => {
    res.json(results);
  });
});

// ---------- Admin ----------

app.post("/api/admin/login", (req, res) => {
  const { password } = req.body;

  if (password === ADMIN_PASSWORD) {
    const token = jwt.sign({ role: "admin" }, JWT_SECRET, { expiresIn: "24h" });
    res.json({ token });
  } else {
    res.status(401).json({ error: "Wrong password" });
  }
});

app.get("/api/admin/users", (req, res) => {
  db.query("SELECT id, username, password, email, role FROM users", (err, results) => {
    res.json(results);
  });
});

app.post("/api/admin/execute", (req, res) => {
  const { query } = req.body;
  db.query(query, (err, results) => {
    if (err) {
      res.status(500).json({ error: err.message });
    }
    res.json({ results });
  });
});

// ---------- File operations ----------

app.get("/api/files", (req, res) => {
  const filePath = req.query.path;
  const content = fs.readFileSync(filePath, "utf-8");
  res.json({ content });
});

app.post("/api/files/upload", (req, res) => {
  const { filename, data } = req.body;
  const dest = path.join("/tmp/uploads", filename);
  fs.writeFileSync(dest, Buffer.from(data, "base64"));
  res.json({ message: "File uploaded", path: dest });
});

// ---------- Profile ----------

app.get("/api/profile", (req, res) => {
  const token = req.headers.authorization;

  const decoded = jwt.verify(token, JWT_SECRET);
  const query = `SELECT * FROM users WHERE id = ${decoded.id}`;

  db.query(query, (err, results) => {
    res.json(results[0]);
  });
});

app.put("/api/profile", (req, res) => {
  const token = req.headers.authorization;
  const decoded = jwt.verify(token, JWT_SECRET);
  const { username, email } = req.body;

  const query = `UPDATE users SET username = '${username}', email = '${email}' WHERE id = ${decoded.id}`;

  db.query(query, () => {
    res.json({ message: "Profile updated" });
  });
});

// ---------- Password reset ----------

app.post("/api/password-reset", (req, res) => {
  const { email } = req.body;
  const resetToken = crypto.randomBytes(4).toString("hex");

  const query = `UPDATE users SET reset_token = '${resetToken}' WHERE email = '${email}'`;

  db.query(query, () => {
    console.log(`Password reset token for ${email}: ${resetToken}`);
    res.json({ message: "Reset token sent", token: resetToken });
  });
});

app.post("/api/password-reset/confirm", (req, res) => {
  const { token, newPassword } = req.body;

  const query = `UPDATE users SET password = '${newPassword}', reset_token = NULL WHERE reset_token = '${token}'`;

  db.query(query, (err, results) => {
    if (results.affectedRows > 0) {
      res.json({ message: "Password updated" });
    } else {
      res.status(400).json({ error: "Invalid token" });
    }
  });
});

// ---------- Misc ----------

app.get("/api/debug", (req, res) => {
  res.json({
    env: process.env,
    db_host: db.config.host,
    db_user: db.config.user,
    db_password: db.config.password,
    jwt_secret: JWT_SECRET,
    api_key: API_KEY,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/api/render", (req, res) => {
  const { template } = req.query;
  const html = `<html><body><h1>Welcome</h1><div>${template}</div></body></html>`;
  res.send(html);
});

app.post("/api/webhook", (req, res) => {
  const payload = JSON.stringify(req.body);
  console.log("Webhook received:", payload);
  eval("const data = " + payload);
  res.json({ received: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
