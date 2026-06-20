require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const pool = require('./db');
const authRoutes = require('./routes/authRoutes');
const messageRoutes = require('./routes/messageRoutes');
const { initSocket } = require('./socket/socketHandler');

const app = express();
const server = http.createServer(app); // http server (not app.listen) — needed for socket.io

const io = new Server(server, {
    cors: {
        origin: '*', // later restrict to your Android app
        methods: ['GET', 'POST']
    }
});

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/messages', messageRoutes);

// Health check — this is what cron-job.org will ping
app.get('/', (req, res) => {
    res.json({ message: 'Backend Running 🚀' });
});

// DB check
pool.query('SELECT NOW()', (err, result) => {
    if (err) {
        console.log('Database connection failed');
        console.log(err);
    } else {
        console.log('Database connected ✅');
    }
});

// Init socket
initSocket(io);

// Start server
server.listen(process.env.PORT || 3000, () => {
    console.log('Server running 🚀');
});