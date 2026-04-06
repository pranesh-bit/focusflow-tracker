const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');

const app = express();

const TRACKER_SECRET = process.env.TRACKER_SECRET || 'secure_key_123';
const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = Number(process.env.DB_PORT || 3306);
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'focusflow_db';
const SEED_ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@test.com';
const SEED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'password';
const SEED_ADMIN_NAME = process.env.SEED_ADMIN_NAME || 'Admin User';

const pool = mysql.createPool({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

let databaseInitializationPromise = null;

async function initializeDatabase() {
    if (!databaseInitializationPromise) {
        databaseInitializationPromise = (async () => {
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
                    'SELECT * FROM users WHERE email = ?',
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
        })().catch((error) => {
            databaseInitializationPromise = null;
            throw error;
        });
    }

    return databaseInitializationPromise;
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/login', async (req, res) => {
    try {
        await initializeDatabase();

        const { email, password } = req.body;
        const connection = await pool.getConnection();

        try {
            const [users] = await connection.query('SELECT * FROM users WHERE email = ?', [email]);

            if (users.length === 0) {
                return res.status(400).json({ error: 'User not found' });
            }

            const user = users[0];
            const isMatch = bcrypt.compareSync(password, user.password);

            if (!isMatch) {
                return res.status(400).json({ error: 'Invalid password' });
            }

            return res.json({
                message: 'Login successful',
                user: { id: user.id, name: user.name, email: user.email }
            });
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/logs/:userId', async (req, res) => {
    try {
        await initializeDatabase();

        const connection = await pool.getConnection();
        try {
            const [logs] = await connection.query('SELECT * FROM logs WHERE userId = ?', [req.params.userId]);
            return res.json(logs);
        } finally {
            connection.release();
        }
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

        const connection = await pool.getConnection();
        try {
            await connection.query(
                'INSERT INTO logs (userId, app, title, category, duration, time, date) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [userId, appName, title, category, duration, time, date]
            );
        } finally {
            connection.release();
        }

        return res.json({ success: true });
    } catch (error) {
        console.error('Track log error:', error);
        return res.status(500).json({ error: 'Database error' });
    }
});

app.delete('/api/logs/:userId', async (req, res) => {
    try {
        await initializeDatabase();

        const connection = await pool.getConnection();
        try {
            await connection.query('DELETE FROM logs WHERE userId = ?', [req.params.userId]);
        } finally {
            connection.release();
        }

        return res.json({ success: true });
    } catch (error) {
        console.error('Delete logs error:', error);
        return res.status(500).json({ error: 'Database error' });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

module.exports = {
    app,
    initializeDatabase
};
