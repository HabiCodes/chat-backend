const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db');

// REGISTER
async function register(req, res) {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Username and password required' });
        }

        if (password.length < 6) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
        }

        // Check if username already taken
        const existing = await pool.query(
            'SELECT id FROM users WHERE username = $1', [username]
        );
        if (existing.rows.length > 0) {
            return res.status(409).json({ success: false, message: 'Username already taken' });
        }

        // Hash password
        const password_hash = await bcrypt.hash(password, 10);

        // Insert user
        const result = await pool.query(
            `INSERT INTO users (username, password_hash) 
             VALUES ($1, $2) 
             RETURNING id, username, created_at`,
            [username, password_hash]
        );

        const user = result.rows[0];

        // Generate JWT
        const token = jwt.sign(
            { id: user.id, username: user.username },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.status(201).json({
            success: true,
            token,
            user: {
                id: user.id,
                username: user.username
            }
        });

    } catch (err) {
        console.log(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}

// LOGIN
async function login(req, res) {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Username and password required' });
        }

        // Find user
        const result = await pool.query(
            'SELECT * FROM users WHERE username = $1', [username]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ success: false, message: 'Invalid username or password' });
        }

        const user = result.rows[0];

        // Check password
        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) {
            return res.status(401).json({ success: false, message: 'Invalid username or password' });
        }

        // Generate JWT
        const token = jwt.sign(
            { id: user.id, username: user.username },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                username: user.username,
                profile_image: user.profile_image
            }
        });

    } catch (err) {
        console.log(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}

module.exports = { register, login };