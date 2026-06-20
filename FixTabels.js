const pool = require('./db');

async function fix() {
    try {
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT`);
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT FALSE`);
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP DEFAULT NOW()`);
        await pool.query(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_group BOOLEAN DEFAULT FALSE`);
        await pool.query(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS group_name TEXT`);
        console.log('All columns added ✅');
    } catch (err) {
        console.log(err);
    }
    process.exit();
}

fix();