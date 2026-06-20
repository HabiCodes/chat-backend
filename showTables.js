const pool = require('./db');

async function showTables() {

    const result = await pool.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema='public';
    `);

    console.log(result.rows);

    process.exit();
}

showTables();