const { app, initializeDatabase } = require('./app');

const PORT = process.env.PORT || 3000;
/*

// SECURITY KEY - The tracker script must send this to prove it's allowed
const TRACKER_SECRET = "secure_key_123"; 

// DATABASE SETUP - MySQL Connection Pool
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'pranesh@123',
    database: 'focusflow_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Initialize Database Tables
async function initializeDatabase() {
    try {
        const connection = await pool.getConnection();
        
        // Create users table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                email VARCHAR(255) UNIQUE,
                password VARCHAR(255),
                name VARCHAR(255)
            )
        `);

        // Create logs table
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

        // Seed Default User
        const [users] = await connection.query('SELECT * FROM users WHERE email = ?', ['admin@test.com']);
        if (users.length === 0) {
            const hashedPassword = bcrypt.hashSync('password', 10);
            await connection.query('INSERT INTO users (email, password, name) VALUES (?, ?, ?)', 
                ['admin@test.com', hashedPassword, 'Admin User']);
        }

        connection.release();
        console.log('✅ Database initialized successfully');
    } catch (error) {
        console.error('❌ Database initialization error:', error);
        process.exit(1);
    }
}

// Initialize database on startup
initializeDatabase();

// MIDDLEWARE
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API ROUTES

// 1. Login
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const connection = await pool.getConnection();
        
        const [users] = await connection.query('SELECT * FROM users WHERE email = ?', [email]);
        connection.release();
        
        if (users.length === 0) return res.status(400).json({ error: 'User not found' });
        
        const user = users[0];
        const isMatch = bcrypt.compareSync(password, user.password);
        if (!isMatch) return res.status(400).json({ error: 'Invalid password' });

        res.json({ 
            message: 'Login successful', 
            user: { id: user.id, name: user.name, email: user.email } 
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// 2. Get Logs (For Dashboard)
app.get('/api/logs/:userId', async (req, res) => {
    try {
        const connection = await pool.getConnection();
        const [logs] = await connection.query('SELECT * FROM logs WHERE userId = ?', [req.params.userId]);
        connection.release();
        res.json(logs);
    } catch (error) {
        res.status(500).json({ error: 'Database error' });
    }
});

// 3. Receive Data from Tracker Script
app.post('/api/track', async (req, res) => {
    try {
        const { secretKey, userId, app, title, category, duration } = req.body;

        // Security Check
        if (secretKey !== TRACKER_SECRET) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        const date = new Date().toISOString().split('T')[0];

        const connection = await pool.getConnection();
        await connection.query(
            'INSERT INTO logs (userId, app, title, category, duration, time, date) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [userId, app, title, category, duration, time, date]
        );
        connection.release();
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Database error' });
    }
});

// 4. Clear Logs
app.delete('/api/logs/:userId', async (req, res) => {
    try {
        const connection = await pool.getConnection();
        await connection.query('DELETE FROM logs WHERE userId = ?', [req.params.userId]);
        connection.release();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Database error' });
    }
});

// START SERVER
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log('Login: admin@test.com / password');
});
*/

initializeDatabase()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`Server running at http://localhost:${PORT}`);
            console.log('Login: admin@test.com / password');
        });
    })
    .catch((error) => {
        console.error('Database initialization error:', error);
        process.exit(1);
    });
