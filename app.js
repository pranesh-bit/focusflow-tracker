const express = require('express');
const path = require('path');
const os = require('os');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
const Database = require('better-sqlite3');
const { neon } = require('@neondatabase/serverless');
const crypto = require('crypto');

const app = express();

const TRACKER_SECRET = process.env.TRACKER_SECRET || 'secure_key_123';
const DB_CLIENT = (process.env.DB_CLIENT || '').toLowerCase();
const DB_HOST = process.env.DB_HOST;
const DB_PORT = Number(process.env.DB_PORT || 3306);
const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'focusflow_db';
const DATABASE_URL = process.env.DATABASE_URL;
const defaultSqlitePath = path.join(process.cwd(), 'focusflow.db');
const SQLITE_DB_PATH = process.env.SQLITE_DB_PATH
    ? path.resolve(process.cwd(), process.env.SQLITE_DB_PATH)
    : defaultSqlitePath;
const SEED_ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@test.com';
const SEED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'password';
const SEED_ADMIN_NAME = process.env.SEED_ADMIN_NAME || 'Admin User';
const SESSION_SECRET = process.env.SESSION_SECRET || `${TRACKER_SECRET}-session-secret`;
const SESSION_COOKIE_NAME = 'focusflow_session';

const isVercel = Boolean(process.env.VERCEL);
const shouldUseNeon = isVercel && DATABASE_URL;
const shouldUseMysql = !shouldUseNeon && (DB_CLIENT === 'mysql' || (DB_CLIENT !== 'sqlite' && Boolean(DB_HOST)));
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
if (!shouldUseMysql && !shouldUseNeon) {
    fs.mkdirSync(path.dirname(SQLITE_DB_PATH), { recursive: true });
}
const sqlite = shouldUseMysql || shouldUseNeon ? null : new Database(SQLITE_DB_PATH);
const sql = shouldUseNeon ? neon(DATABASE_URL) : null;

let databaseInitializationPromise = null;

async function initializeNeonDatabase() {
    await sql`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            email TEXT UNIQUE,
            password TEXT,
            name TEXT,
            trackerToken TEXT UNIQUE
        );

        CREATE TABLE IF NOT EXISTS logs (
            id SERIAL PRIMARY KEY,
            userId INTEGER,
            app TEXT,
            title TEXT,
            category TEXT,
            duration INTEGER,
            time TEXT,
            date TEXT,
            FOREIGN KEY(userId) REFERENCES users(id)
        );
    `;

    const user = await sql`SELECT id FROM users WHERE email = ${SEED_ADMIN_EMAIL}`;
    if (user.length === 0) {
        const hashedPassword = bcrypt.hashSync(SEED_ADMIN_PASSWORD, 10);
        await sql`INSERT INTO users (email, password, name, trackerToken) VALUES (${SEED_ADMIN_EMAIL}, ${hashedPassword}, ${SEED_ADMIN_NAME}, ${createTrackerToken()})`;
    } else {
        const existingUser = await sql`SELECT trackerToken FROM users WHERE email = ${SEED_ADMIN_EMAIL}`;
        if (!existingUser[0].trackerToken) {
            await sql`UPDATE users SET trackerToken = ${createTrackerToken()} WHERE email = ${SEED_ADMIN_EMAIL}`;
        }
    }
}

function initializeSqliteDatabase() {
    sqlite.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE,
            password TEXT,
            name TEXT,
            trackerToken TEXT UNIQUE
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

    const userColumns = sqlite.prepare('PRAGMA table_info(users)').all();
    if (!userColumns.some((column) => column.name === 'trackerToken')) {
        sqlite.exec('ALTER TABLE users ADD COLUMN trackerToken TEXT');
        sqlite.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_tracker_token ON users(trackerToken)');
    }

    const user = sqlite.prepare('SELECT id FROM users WHERE email = ?').get(SEED_ADMIN_EMAIL);
    if (!user) {
        const hashedPassword = bcrypt.hashSync(SEED_ADMIN_PASSWORD, 10);
        sqlite.prepare(
            'INSERT INTO users (email, password, name, trackerToken) VALUES (?, ?, ?, ?)'
        ).run(SEED_ADMIN_EMAIL, hashedPassword, SEED_ADMIN_NAME, createTrackerToken());
    } else {
        const existingUser = sqlite.prepare('SELECT trackerToken FROM users WHERE email = ?').get(SEED_ADMIN_EMAIL);
        if (!existingUser.trackerToken) {
            sqlite.prepare('UPDATE users SET trackerToken = ? WHERE email = ?').run(createTrackerToken(), SEED_ADMIN_EMAIL);
        }
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
                name VARCHAR(255),
                trackerToken VARCHAR(255) UNIQUE
            )
        `);

        try {
            await connection.query('ALTER TABLE users ADD COLUMN trackerToken VARCHAR(255) UNIQUE');
        } catch (error) {
            if (!String(error.message).includes('Duplicate column name')) {
                throw error;
            }
        }

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
            'SELECT id, trackerToken FROM users WHERE email = ?',
            [SEED_ADMIN_EMAIL]
        );

        if (users.length === 0) {
            const hashedPassword = bcrypt.hashSync(SEED_ADMIN_PASSWORD, 10);
            await connection.query(
                'INSERT INTO users (email, password, name, trackerToken) VALUES (?, ?, ?, ?)',
                [SEED_ADMIN_EMAIL, hashedPassword, SEED_ADMIN_NAME, createTrackerToken()]
            );
        } else if (!users[0].trackerToken) {
            await connection.query(
                'UPDATE users SET trackerToken = ? WHERE email = ?',
                [createTrackerToken(), SEED_ADMIN_EMAIL]
            );
        }
    } finally {
        connection.release();
    }
}

function createTrackerToken() {
    return crypto.randomBytes(24).toString('hex');
}

async function initializeDatabase() {
    if (!databaseInitializationPromise) {
        databaseInitializationPromise = (shouldUseNeon
            ? initializeNeonDatabase()
            : shouldUseMysql
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
    if (shouldUseNeon) {
        const users = await sql`SELECT * FROM users WHERE email = ${email}`;
        return users[0] || null;
    }

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

async function findUserById(id) {
    if (shouldUseNeon) {
        const users = await sql`SELECT * FROM users WHERE id = ${id}`;
        return users[0] || null;
    }

    if (shouldUseMysql) {
        const connection = await pool.getConnection();
        try {
            const [users] = await connection.query('SELECT * FROM users WHERE id = ?', [id]);
            return users[0] || null;
        } finally {
            connection.release();
        }
    }

    return sqlite.prepare('SELECT * FROM users WHERE id = ?').get(id) || null;
}

async function findUserByTrackerToken(trackerToken) {
    if (shouldUseNeon) {
        const users = await sql`SELECT * FROM users WHERE trackerToken = ${trackerToken}`;
        return users[0] || null;
    }

    if (shouldUseMysql) {
        const connection = await pool.getConnection();
        try {
            const [users] = await connection.query('SELECT * FROM users WHERE trackerToken = ?', [trackerToken]);
            return users[0] || null;
        } finally {
            connection.release();
        }
    }

    return sqlite.prepare('SELECT * FROM users WHERE trackerToken = ?').get(trackerToken) || null;
}

async function createUser(name, email, password) {
    const hashedPassword = bcrypt.hashSync(password, 10);
    const trackerToken = createTrackerToken();

    if (shouldUseNeon) {
        const result = await sql`INSERT INTO users (email, password, name, trackerToken) VALUES (${email}, ${hashedPassword}, ${name}, ${trackerToken}) RETURNING id`;
        return { id: result[0].id, name, email, trackerToken };
    }

    if (shouldUseMysql) {
        const connection = await pool.getConnection();
        try {
            const [result] = await connection.query(
                'INSERT INTO users (email, password, name, trackerToken) VALUES (?, ?, ?, ?)',
                [email, hashedPassword, name, trackerToken]
            );
            return { id: result.insertId, name, email, trackerToken };
        } finally {
            connection.release();
        }
    }

    const result = sqlite.prepare(
        'INSERT INTO users (email, password, name, trackerToken) VALUES (?, ?, ?, ?)'
    ).run(email, hashedPassword, name, trackerToken);

    return {
        id: Number(result.lastInsertRowid),
        name,
        email,
        trackerToken
    };
}

async function ensureTrackerToken(user) {
    if (user.trackerToken) {
        return user.trackerToken;
    }

    const trackerToken = createTrackerToken();

    if (shouldUseNeon) {
        await sql`UPDATE users SET trackerToken = ${trackerToken} WHERE id = ${user.id}`;
    } else if (shouldUseMysql) {
        const connection = await pool.getConnection();
        try {
            await connection.query(
                'UPDATE users SET trackerToken = ? WHERE id = ?',
                [trackerToken, user.id]
            );
        } finally {
            connection.release();
        }
    } else {
        sqlite.prepare('UPDATE users SET trackerToken = ? WHERE id = ?').run(trackerToken, user.id);
    }

    return trackerToken;
}

function createSessionCookieValue(userId) {
    const payload = `${userId}.${Date.now()}`;
    const signature = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
    return Buffer.from(`${payload}.${signature}`).toString('base64url');
}

function parseCookies(headerValue) {
    if (!headerValue) {
        return {};
    }

    return headerValue.split(';').reduce((cookies, part) => {
        const trimmed = part.trim();
        const separatorIndex = trimmed.indexOf('=');
        if (separatorIndex === -1) {
            return cookies;
        }

        const key = trimmed.slice(0, separatorIndex);
        const value = trimmed.slice(separatorIndex + 1);
        cookies[key] = value;
        return cookies;
    }, {});
}

function getSessionUserIdFromRequest(req) {
    const cookies = parseCookies(req.headers.cookie);
    const sessionCookie = cookies[SESSION_COOKIE_NAME];
    if (!sessionCookie) {
        return null;
    }

    try {
        const decoded = Buffer.from(sessionCookie, 'base64url').toString('utf8');
        const [userId, issuedAt, signature] = decoded.split('.');
        if (!userId || !issuedAt || !signature) {
            return null;
        }

        const payload = `${userId}.${issuedAt}`;
        const expectedSignature = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
        if (signature !== expectedSignature) {
            return null;
        }

        return Number(userId);
    } catch (error) {
        return null;
    }
}

function setSessionCookie(res, userId) {
    const isSecure = process.env.NODE_ENV === 'production';
    const cookieValue = createSessionCookieValue(userId);
    res.setHeader(
        'Set-Cookie',
        `${SESSION_COOKIE_NAME}=${cookieValue}; Path=/; HttpOnly; SameSite=Lax${isSecure ? '; Secure' : ''}; Max-Age=${60 * 60 * 24 * 30}`
    );
}

function clearSessionCookie(res) {
    const isSecure = process.env.NODE_ENV === 'production';
    res.setHeader(
        'Set-Cookie',
        `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax${isSecure ? '; Secure' : ''}; Max-Age=0`
    );
}

async function requireSessionUser(req, res, next) {
    try {
        await initializeDatabase();
        const userId = getSessionUserIdFromRequest(req);
        if (!userId) {
            return res.status(401).json({ error: 'Please login first.' });
        }

        const user = await findUserById(userId);
        if (!user) {
            clearSessionCookie(res);
            return res.status(401).json({ error: 'Session expired.' });
        }

        req.sessionUser = user;
        return next();
    } catch (error) {
        console.error('Session error:', error);
        return res.status(500).json({ error: 'Server error' });
    }
}

async function getLogsByUserId(userId) {
    if (shouldUseNeon) {
        return await sql`SELECT * FROM logs WHERE userId = ${userId}`;
    }

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
    if (shouldUseNeon) {
        await sql`INSERT INTO logs (userId, app, title, category, duration, time, date) VALUES (${userId}, ${appName}, ${title}, ${category}, ${duration}, ${time}, ${date})`;
        return;
    }

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
    if (shouldUseNeon) {
        await sql`DELETE FROM logs WHERE userId = ${userId}`;
        return;
    }

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

app.post('/api/signup', async (req, res) => {
    try {
        await initializeDatabase();

        const { name, email, password } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Name, email, and password are required.' });
        }

        const normalizedEmail = email.trim().toLowerCase();
        const existingUser = await findUserByEmail(normalizedEmail);
        if (existingUser) {
            return res.status(400).json({ error: 'An account with this email already exists.' });
        }

        const user = await createUser(name.trim(), normalizedEmail, password);
        setSessionCookie(res, user.id);
        return res.status(201).json({ message: 'Signup successful', user });
    } catch (error) {
        console.error('Signup error:', error);
        return res.status(500).json({ error: 'Server error' });
    }
});

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

        const trackerToken = await ensureTrackerToken(user);
        setSessionCookie(res, user.id);

        return res.json({
            message: 'Login successful',
            user: { id: user.id, name: user.name, email: user.email, trackerToken }
        });
    } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/me', requireSessionUser, async (req, res) => {
    try {
        const trackerToken = await ensureTrackerToken(req.sessionUser);
        return res.json({
            user: {
                id: req.sessionUser.id,
                name: req.sessionUser.name,
                email: req.sessionUser.email,
                trackerToken
            }
        });
    } catch (error) {
        console.error('Session user fetch error:', error);
        return res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/logout', (req, res) => {
    clearSessionCookie(res);
    return res.json({ success: true });
});

app.get('/api/logs', requireSessionUser, async (req, res) => {
    try {
        const logs = await getLogsByUserId(req.sessionUser.id);
        return res.json(logs);
    } catch (error) {
        console.error('Fetch logs error:', error);
        return res.status(500).json({ error: 'Database error' });
    }
});

app.post('/api/track', async (req, res) => {
    try {
        await initializeDatabase();

        const { secretKey, userId, trackerToken, app: appName, title, category, duration } = req.body;

        let targetUserId = userId;
        if (trackerToken) {
            const user = await findUserByTrackerToken(trackerToken);
            if (!user) {
                return res.status(403).json({ error: 'Invalid tracker token' });
            }
            targetUserId = user.id;
        } else if (secretKey !== TRACKER_SECRET) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const time = new Date().toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        });
        const date = new Date().toISOString().split('T')[0];

        await insertLog(targetUserId, appName, title, category, duration, time, date);
        return res.json({ success: true });
    } catch (error) {
        console.error('Track log error:', error);
        return res.status(500).json({ error: 'Database error' });
    }
});

app.delete('/api/logs', requireSessionUser, async (req, res) => {
    try {
        await deleteLogsByUserId(req.sessionUser.id);
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
