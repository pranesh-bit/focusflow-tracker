const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
/*

async function setup() {
    try {
        // First, connect without specifying a database to create it
        const connection = await mysql.createConnection({
            host: 'localhost',
            user: 'root',
            password: 'pranesh@123'
        });

        console.log('✅ Connected to MySQL');

        // Create database
        await connection.query('CREATE DATABASE IF NOT EXISTS focusflow_db');
        console.log('✅ Database created');

        // Now connect to the specific database
        await connection.query('USE focusflow_db');

        // Create users table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                email VARCHAR(255) UNIQUE,
                password VARCHAR(255),
                name VARCHAR(255)
            )
        `);
        console.log('✅ Users table created');

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
        console.log('✅ Logs table created');

        // Seed default user
        const [users] = await connection.query('SELECT * FROM users WHERE email = ?', ['admin@test.com']);
        if (users.length === 0) {
            const hashedPassword = bcrypt.hashSync('password', 10);
            await connection.query('INSERT INTO users (email, password, name) VALUES (?, ?, ?)', 
                ['admin@test.com', hashedPassword, 'Admin User']);
            console.log('✅ Default user created (Email: admin@test.com, Password: password)');
        } else {
            console.log('✅ Default user already exists');
        }

        await connection.end();
        console.log('\n✅ Database setup completed successfully!\n');
        process.exit(0);
    } catch (error) {
        console.error('❌ Setup error:', error.message);
        process.exit(1);
    }
}

setup();
*/

const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = Number(process.env.DB_PORT || 3306);
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'focusflow_db';
const SEED_ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@test.com';
const SEED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'password';
const SEED_ADMIN_NAME = process.env.SEED_ADMIN_NAME || 'Admin User';

async function setup() {
    try {
        const connection = await mysql.createConnection({
            host: DB_HOST,
            port: DB_PORT,
            user: DB_USER,
            password: DB_PASSWORD
        });

        console.log('Connected to MySQL');

        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\``);
        console.log('Database created');

        await connection.query(`USE \`${DB_NAME}\``);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                email VARCHAR(255) UNIQUE,
                password VARCHAR(255),
                name VARCHAR(255)
            )
        `);
        console.log('Users table created');

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
        console.log('Logs table created');

        const [users] = await connection.query('SELECT * FROM users WHERE email = ?', [SEED_ADMIN_EMAIL]);
        if (users.length === 0) {
            const hashedPassword = bcrypt.hashSync(SEED_ADMIN_PASSWORD, 10);
            await connection.query(
                'INSERT INTO users (email, password, name) VALUES (?, ?, ?)',
                [SEED_ADMIN_EMAIL, hashedPassword, SEED_ADMIN_NAME]
            );
            console.log(`Default user created (Email: ${SEED_ADMIN_EMAIL})`);
        } else {
            console.log('Default user already exists');
        }

        await connection.end();
        console.log('\nDatabase setup completed successfully.\n');
        process.exit(0);
    } catch (error) {
        console.error('Setup error:', error.message);
        process.exit(1);
    }
}

setup();
