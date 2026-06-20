const pool = require('../db');

// Get all conversations for logged-in user
async function getConversations(req, res) {
    try {
        const userId = req.user.id;

        const result = await pool.query(`
            SELECT 
                c.id AS conversation_id,
                c.is_group,
                c.group_name,
                -- Get the other user's info (for 1-to-1)
                u.id AS other_user_id,
                u.username AS other_username,
                u.profile_image,
                u.is_online,
                u.last_seen,
                -- Last message
                m.text AS last_message,
                m.created_at AS last_message_time,
                m.sender_id AS last_message_sender,
                -- Unread count
                (
                    SELECT COUNT(*) FROM messages 
                    WHERE conversation_id = c.id 
                    AND is_seen = FALSE 
                    AND sender_id != $1
                ) AS unread_count
            FROM conversations c
            JOIN participants p ON p.conversation_id = c.id
            JOIN participants p2 ON p2.conversation_id = c.id AND p2.user_id != $1
            JOIN users u ON u.id = p2.user_id
            LEFT JOIN messages m ON m.id = (
                SELECT id FROM messages 
                WHERE conversation_id = c.id 
                ORDER BY created_at DESC 
                LIMIT 1
            )
            WHERE p.user_id = $1
            ORDER BY last_message_time DESC NULLS LAST
        `, [userId]);

        res.json({ success: true, conversations: result.rows });

    } catch (err) {
        console.log(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}

// Get messages inside a conversation
async function getMessages(req, res) {
    try {
        const userId = req.user.id;
        const { conversationId } = req.params;

        // Make sure this user is part of this conversation
        const member = await pool.query(
            'SELECT * FROM participants WHERE conversation_id = $1 AND user_id = $2',
            [conversationId, userId]
        );
        if (member.rows.length === 0) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        // Fetch messages
        const result = await pool.query(`
            SELECT 
                m.id, m.text, m.created_at, m.is_seen, m.sender_id,
                u.username AS sender_username
            FROM messages m
            JOIN users u ON u.id = m.sender_id
            WHERE m.conversation_id = $1
            ORDER BY m.created_at ASC
        `, [conversationId]);

        // Mark messages as seen
        await pool.query(`
            UPDATE messages 
            SET is_seen = TRUE 
            WHERE conversation_id = $1 AND sender_id != $2 AND is_seen = FALSE
        `, [conversationId, userId]);

        res.json({ success: true, messages: result.rows });

    } catch (err) {
        console.log(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}

// Start or get existing conversation with another user
async function getOrCreateConversation(req, res) {
    try {
        const userId = req.user.id;
        const { targetUserId } = req.body;

        if (!targetUserId) {
            return res.status(400).json({ success: false, message: 'targetUserId required' });
        }

        if (userId === parseInt(targetUserId)) {
            return res.status(400).json({ success: false, message: 'Cannot chat with yourself' });
        }

        // Check if conversation already exists between these two users
        const existing = await pool.query(`
            SELECT c.id FROM conversations c
            JOIN participants p1 ON p1.conversation_id = c.id AND p1.user_id = $1
            JOIN participants p2 ON p2.conversation_id = c.id AND p2.user_id = $2
            WHERE c.is_group = FALSE
        `, [userId, targetUserId]);

        if (existing.rows.length > 0) {
            return res.json({ success: true, conversationId: existing.rows[0].id });
        }

        // Create new conversation
        const conv = await pool.query(
            'INSERT INTO conversations DEFAULT VALUES RETURNING id'
        );
        const conversationId = conv.rows[0].id;

        // Add both users as participants
        await pool.query(
            'INSERT INTO participants (conversation_id, user_id) VALUES ($1, $2), ($1, $3)',
            [conversationId, userId, targetUserId]
        );

        res.status(201).json({ success: true, conversationId });

    } catch (err) {
        console.log(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}

// Search users by username (to start a new chat)
async function searchUsers(req, res) {
    try {
        const { username } = req.query;
        const userId = req.user.id;

        if (!username) {
            return res.status(400).json({ success: false, message: 'username query required' });
        }

        const result = await pool.query(`
            SELECT id, username, profile_image, is_online
            FROM users
            WHERE username ILIKE $1 AND id != $2
            LIMIT 10
        `, [`%${username}%`, userId]);

        res.json({ success: true, users: result.rows });

    } catch (err) {
        console.log(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}

module.exports = { getConversations, getMessages, getOrCreateConversation, searchUsers };