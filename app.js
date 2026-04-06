const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
const Database = require('better-sqlite3');

const app = express();

const TRACKER_SECRET = process.env.TRACKER_SECRET || 'secure_key_123';
const DB_CLIENT = (process.env.DB_CLIENT || '').toLowerCase();
const DB_HOST = process.env.DB_HOST;
const DB_PORT = Number(process.env.DB_PORT || 3306);
const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'focusflow_db';
const SQLITE_DB_PATH = process.env.SQLITE_DB_PATH
    || (process.env.RENDER_DISK_ROOT
        ? path.join(process.env.RENDER_DISK_ROOT, 'focusflow.db')
        : path.join(__dirname, 'focusflow.db'));
const SEED_ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@test.com';
const SEED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'password';
const SEED_ADMIN_NAME = process.env.SEED_ADMIN_NAME || 'Admin User';

const shouldUseMysql = DB_CLIENT === 'mysql' || (DB_CLIENT !== 'sqlite' && Boolean(DB_HOST));
const pool = shouldUseMysql
    ? mysql.createPool({
        host: DB_HOST,
        port: DB_PORT,
        user: DB_USER,
        password: DB_PASSWORD,
        database: DB_NAME,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    })
    : null;
const sqlite = shouldUseMysql ? null : new Database(SQLITE_DB_PATH);

let databaseInitializationPromise = null;

function initializeSqliteDatabase() {
    sqlite.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE,
            password TEXT,
            name TEXT
        );

        CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId INTEGER,
            app TEXT,
            title TEXT,
            category TEXT,
            duration INTEGER,
            time TEXT,
            date TEXT,
            FOREIGN KEY(userId) REFERENCES users(id)
        );
    `);

    const user = sqlite.prepare('SELECT id FROM users WHERE email = ?').get(SEED_ADMIN_EMAIL);
    if (!user) {
        const hashedPassword = bcrypt.hashSync(SEED_ADMIN_PASSWORD, 10);
        sqlite.prepare(
            'INSERT INTO users (email, password, name) VALUES (?, ?, ?)'
        ).run(SEED_ADMIN_EMAIL, hashedPassword, SEED_ADMIN_NAME);
    }
}

async function initializeMysqlDatabase() {
    if (!DB_HOST || !DB_USER || !DB_NAME) {
        throw new Error('MySQL mode requires DB_HOST, DB_USER, and DB_NAME.');
    }

    const connection = await pool.getConnection();
    try {
        await connection.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                email VARCHAR(255) UNIQUE,
                password VARCHAR(255),
                name VARCHAR(255)
            )
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                userId INT,
                app VARCHAR(255),
                title VARCHAR(255),
                category VARCHAR(255),
                duration INT,
                time VARCHAR(50),
                date DATE,
                FOREIGN KEY(userId) REFERENCES users(id)
            )
        `);

        const [users] = await connection.query(
            'SELECT id FROM users WHERE email = ?',
            [SEED_ADMIN_EMAIL]
        );

        if (users.length === 0) {
            const hashedPassword = bcrypt.hashSync(SEED_ADMIN_PASSWORD, 10);
            await connection.query(
                'INSERT INTO users (email, password, name) VALUES (?, ?, ?)',
                [SEED_ADMIN_EMAIL, hashedPassword, SEED_ADMIN_NAME]
            );
        }
    } finally {
        connection.release();
    }
}

async function initializeDatabase() {
    if (!databaseInitializationPromise) {
        databaseInitializationPromise = (shouldUseMysql
            ? initializeMysqlDatabase()
            : Promise.resolve().then(() => initializeSqliteDatabase())
        ).catch((error) => {
            databaseInitializationPromise = null;
            throw error;
        });
    }

    return databaseInitializationPromise;
}

async function findUserByEmail(email) {
    if (shouldUseMysql) {
        const connection = await pool.getConnection();
        try {
            const [users] = await connection.query('SELECT * FROM users WHERE email = ?', [email]);
            return users[0] || null;
        } finally {
            connection.release();
        }
    }

    return sqlite.prepare('SELECT * FROM users WHERE email = ?').get(email) || null;
}

async function getLogsByUserId(userId) {
    if (shouldUseMysql) {
        const connection = await pool.getConnection();
        try {
            const [logs] = await connection.query('SELECT * FROM logs WHERE userId = ?', [userId]);
            return logs;
        } finally {
            connection.release();
        }
    }

    return sqlite.prepare('SELECT * FROM logs WHERE userId = ?').all(userId);
}

async function insertLog(userId, appName, title, category, duration, time, date) {
    if (shouldUseMysql) {
        const connection = await pool.getConnection();
        try {
            await connection.query(
                'INSERT INTO logs (userId, app, title, category, duration, time, date) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [userId, appName, title, category, duration, time, date]
            );
            return;
        } finally {
            connection.release();
        }
    }

    sqlite.prepare(
        'INSERT INTO logs (userId, app, title, category, duration, time, date) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(userId, appName, title, category, duration, time, date);
}

async function deleteLogsByUserId(userId) {
    if (shouldUseMysql) {
        const connection = await pool.getConnection();
        try {
            await connection.query('DELETE FROM logs WHERE userId = ?', [userId]);
            return;
        } finally {
            connection.release();
        }
    }

    sqlite.prepare('DELETE FROM logs WHERE userId = ?').run(userId);
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/login', async (req, res) => {
    try {
        await initializeDatabase();

        const { email, password } = req.body;
        const user = await findUserByEmail(email);

        if (!user) {
            return res.status(400).json({ error: 'User not found' });
        }

        const isMatch = bcrypt.compareSync(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: 'Invalid password' });
        }

        return res.json({
            message: 'Login successful',
            user: { id: user.id, name: user.name, email: user.email }
        });
    } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/logs/:userId', async (req, res) => {
    try {
        await initializeDatabase();
        const logs = await getLogsByUserId(req.params.userId);
        return res.json(logs);
    } catch (error) {
        console.error('Fetch logs error:', error);
        return res.status(500).json({ error: 'Database error' });
    }
});

app.post('/api/track', async (req, res) => {
    try {
        await initializeDatabase();

        const { secretKey, userId, app: appName, title, category, duration } = req.body;
        if (secretKey !== TRACKER_SECRET) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const time = new Date().toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        });
        const date = new Date().toISOString().split('T')[0];

        await insertLog(userId, appName, title, category, duration, time, date);
        return res.json({ success: true });
    } catch (error) {
        console.error('Track log error:', error);
        return res.status(500).json({ error: 'Database error' });
    }
});

app.delete('/api/logs/:userId', async (req, res) => {
    try {
        await initializeDatabase();
        await deleteLogsByUserId(req.params.userId);
        return res.json({ success: true });
    } catch (error) {
        console.error('Delete logs error:', error);
        return res.status(500).json({ error: 'Database error' });
    }
});

app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

module.exports = {
    app,
    initializeDatabase,
    shouldUseMysql,
    SQLITE_DB_PATH
};
