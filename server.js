require('dotenv').config();
const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const cors    = require('cors');
const path    = require('path');

// ── Init ──────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET','POST'] }
});

// ── Trigger DB connection check ───────────────────────
require('./config/db');

// ── Middleware ────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Static frontend ───────────────────────────────────
app.use(express.static(path.join(__dirname, '../frontend')));

// ── API Routes ────────────────────────────────────────
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/requests', require('./routes/requests'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/admin',    require('./routes/admin'));

// ── Catch-all → SPA ──────────────────────────────────
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ── Socket.io real-time ───────────────────────────────
const onlineUsers = new Map(); // userId → socketId

io.on('connection', (socket) => {
  // User comes online
  socket.on('user_online', (userId) => {
    onlineUsers.set(String(userId), socket.id);
    io.emit('online_users', Array.from(onlineUsers.keys()));
  });

  // Private message relay
  socket.on('send_message', (data) => {
    const receiverSocket = onlineUsers.get(String(data.receiverId));
    if (receiverSocket) io.to(receiverSocket).emit('receive_message', data);
  });

  // Typing indicator relay
  socket.on('typing', (data) => {
    const receiverSocket = onlineUsers.get(String(data.receiverId));
    if (receiverSocket) io.to(receiverSocket).emit('typing', data);
  });

  // Request status change notification
  socket.on('request_updated', (data) => {
    io.emit('request_status_changed', data);
  });

  // Cleanup on disconnect
  socket.on('disconnect', () => {
    for (const [uid, sid] of onlineUsers) {
      if (sid === socket.id) { onlineUsers.delete(uid); break; }
    }
    io.emit('online_users', Array.from(onlineUsers.keys()));
  });
});

// ── Start ─────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`\n🚚 TransportFlow server running on http://localhost:${PORT}`);
  console.log(`📦 Environment : ${process.env.NODE_ENV || 'development'}`);
  console.log(`🗄️  Database    : ${process.env.DB_NAME || 'transport_db'} @ ${process.env.DB_HOST || 'localhost'}\n`);
});
