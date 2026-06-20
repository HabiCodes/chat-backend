const jwt = require('jsonwebtoken');
const pool = require('../db');

// Map to track online users: userId -> socketId
const onlineUsers = new Map();

function initSocket(io) {

    // Middleware — verify JWT on socket connection
    io.use((socket, next) => {
        const token = socket.handshake.auth.token;
        if (!token) return next(new Error('No token'));

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            socket.user = decoded; // { id, username }
            next();
        } catch (err) {
            next(new Error('Invalid token'));
        }
    });

    io.on('connection', async (socket) => {
        const userId = socket.user.id;
        const username = socket.user.username;

        console.log(`${username} connected`);

        // Track online
        onlineUsers.set(userId, socket.id);

        // Update DB
        await pool.query(
            'UPDATE users SET is_online = TRUE WHERE id = $1',
            [userId]
        );

        // Tell everyone this user is online
        socket.broadcast.emit('user_online', { userId });

        // ─────────────────────────────────────────
        // JOIN — client must join their conversation rooms
        // ─────────────────────────────────────────
        socket.on('join_conversations', async () => {
            try {
                const result = await pool.query(
                    'SELECT conversation_id FROM participants WHERE user_id = $1',
                    [userId]
                );
                result.rows.forEach(row => {
                    socket.join(`conv_${row.conversation_id}`);
                });
            } catch (err) {
                console.log(err);
            }
        });

        // ─────────────────────────────────────────
        // SEND MESSAGE
        // ─────────────────────────────────────────
        socket.on('send_message', async (data) => {
            try {
                const { conversationId, text } = data;

                if (!text || !text.trim()) return;

                // Verify sender is part of this conversation
                const member = await pool.query(
                    'SELECT * FROM participants WHERE conversation_id = $1 AND user_id = $2',
                    [conversationId, userId]
                );
                if (member.rows.length === 0) return;

                // Save message to DB
                const result = await pool.query(
                    `INSERT INTO messages (conversation_id, sender_id, text)
                     VALUES ($1, $2, $3)
                     RETURNING id, conversation_id, sender_id, text, is_seen, created_at`,
                    [conversationId, userId, text.trim()]
                );

                const message = {
                    ...result.rows[0],
                    sender_username: username
                };

                // Emit to everyone in the conversation room (including sender)
                io.to(`conv_${conversationId}`).emit('new_message', message);

            } catch (err) {
                console.log(err);
            }
        });

        // ─────────────────────────────────────────
        // TYPING INDICATOR
        // ─────────────────────────────────────────
        socket.on('typing', (data) => {
            const { conversationId } = data;
            socket.to(`conv_${conversationId}`).emit('user_typing', {
                userId,
                username,
                conversationId
            });
        });

        socket.on('stop_typing', (data) => {
            const { conversationId } = data;
            socket.to(`conv_${conversationId}`).emit('user_stop_typing', {
                userId,
                conversationId
            });
        });

        // ─────────────────────────────────────────
        // READ RECEIPTS
        // ─────────────────────────────────────────
        socket.on('mark_seen', async (data) => {
            try {
                const { conversationId } = data;

                await pool.query(
                    `UPDATE messages SET is_seen = TRUE
                     WHERE conversation_id = $1 AND sender_id != $2 AND is_seen = FALSE`,
                    [conversationId, userId]
                );

                // Notify the other person their messages were seen
                socket.to(`conv_${conversationId}`).emit('messages_seen', {
                    conversationId,
                    seenBy: userId
                });

            } catch (err) {
                console.log(err);
            }
        });

        // ─────────────────────────────────────────
        // START NEW CONVERSATION (via socket)
        // ─────────────────────────────────────────
        socket.on('join_new_conversation', (data) => {
            const { conversationId } = data;
            socket.join(`conv_${conversationId}`);
        });

        // ─────────────────────────────────────────
        // DISCONNECT
        // ─────────────────────────────────────────
        socket.on('disconnect', async () => {
            console.log(`${username} disconnected`);

            onlineUsers.delete(userId);

            const lastSeen = new Date();

            await pool.query(
                'UPDATE users SET is_online = FALSE, last_seen = $1 WHERE id = $2',
                [lastSeen, userId]
            );

            // Tell everyone this user is offline
            socket.broadcast.emit('user_offline', {
                userId,
                lastSeen
            });
        });
    });
}

module.exports = { initSocket };