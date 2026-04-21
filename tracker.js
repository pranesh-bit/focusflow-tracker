const activeWin = require('active-win');
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'config.json');

// --- CONFIGURATION ---
let config = {};
try {
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
} catch (error) {
    // config.json doesn't exist yet, will be created on first login
}

const INTERVAL_MS = Number(process.env.FOCUSFLOW_INTERVAL_MS || 10000);
const FLUSH_INTERVAL_MS = Number(process.env.FOCUSFLOW_FLUSH_INTERVAL_MS || 60000);

// --- STATE VARIABLES ---
let previousApp = null;
let previousTitle = null;
let startTime = Date.now();
let lastSavedAt = Date.now();
let isFlushing = false;

// Helper: Decide category based on App Name
function getCategory(appName) {
    const appLower = appName.toLowerCase();
    
    if (appLower.includes('code') || appLower.includes('visual studio') || appLower.includes('idea')) 
        return 'Development';
    
    if (appLower.includes('chrome') || appLower.includes('firefox') || appLower.includes('edge')) 
        return 'Browsing';
    
    if (appLower.includes('slack') || appLower.includes('discord') || appLower.includes('teams')) 
        return 'Communication';
        
    if (appLower.includes('spotify') || appLower.includes('netflix')) 
        return 'Entertainment';

    return 'Other';
}

// Helper: Send data to server
async function saveLog(SERVER_URL, SECRET_KEY, TRACKER_TOKEN, app, title, category, duration) {
    try {
        const response = await fetch(SERVER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                secretKey: SECRET_KEY,
                trackerToken: TRACKER_TOKEN || undefined,
                app: app,
                title: title,
                category: category,
                duration: duration
            })
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`${response.status} ${errorText}`);
        }
        console.log(`✅ Saved: ${app} (${Math.round(duration / 60)}m)`);
    } catch (error) {
        console.error("❌ Error saving:", error.message);
    }
}

async function main() {
    // --- AUTO-LOGIN if no token found ---
    let SERVER_URL = process.env.FOCUSFLOW_SERVER_URL || config.serverUrl || 'http://localhost:3000/api/track';
    let SECRET_KEY = process.env.TRACKER_SECRET || config.secretKey || 'secure_key_123';
    let TRACKER_TOKEN = process.env.FOCUSFLOW_TRACKER_TOKEN || config.trackerToken || '';

    if (!TRACKER_TOKEN) {
        const emailArg = process.argv.find(a => a.startsWith('--email='))?.split('=')[1];
        const passArg  = process.argv.find(a => a.startsWith('--password='))?.split('=')[1];
        const urlArg   = process.argv.find(a => a.startsWith('--url='))?.split('=')[1];

        if (!emailArg || !passArg) {
            console.error('❌ No tracker token found in config.json.');
            console.error('   Run once with your credentials to set up:');
            console.error('   node tracker.js --email="you@email.com" --password="yourpassword"');
            process.exit(1);
        }

        const baseUrl = (urlArg || 'http://localhost:3000').replace(/\/api\/track$/, '').replace(/\/$/, '');
        console.log(`\n🔐 Logging in as ${emailArg}...`);

        try {
            const res  = await fetch(`${baseUrl}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: emailArg, password: passArg })
            });
            const data = await res.json();

            if (!res.ok || !data.user?.trackerToken) {
                console.error('❌ Login failed:', data.error || 'Invalid credentials');
                process.exit(1);
            }

            // Save to config.json — next run needs no args
            config.serverUrl    = `${baseUrl}/api/track`;
            config.trackerToken = data.user.trackerToken;
            config.secretKey    = SECRET_KEY;
            fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));

            SERVER_URL    = config.serverUrl;
            TRACKER_TOKEN = config.trackerToken;
            console.log(`✅ Logged in as ${data.user.name}. Config saved — future runs need no arguments.\n`);
        } catch (err) {
            console.error('❌ Could not reach server:', err.message);
            process.exit(1);
        }
    }

    console.log('🔴 FocusFlow Tracker Started...');
    console.log('Calculating accurate time. Press Ctrl+C to stop.\n');

    async function flushCurrentWindow(force = false) {
        if (isFlushing || previousApp === null) return;

        const now = Date.now();
        const durationSeconds = Math.round((now - startTime) / 1000);
        const shouldFlush = force || (now - lastSavedAt >= FLUSH_INTERVAL_MS);

        if (!shouldFlush || durationSeconds <= 0) return;

        isFlushing = true;
        try {
            await saveLog(SERVER_URL, SECRET_KEY, TRACKER_TOKEN, previousApp, previousTitle, getCategory(previousApp), durationSeconds);
            startTime = now;
            lastSavedAt = now;
        } finally {
            isFlushing = false;
        }
    }

    async function track() {
        try {
            const window = await activeWin();
            if (!window || !window.owner || !window.owner.name) return;

            const currentApp   = window.owner.name;
            const currentTitle = window.title || 'Untitled';
            console.log(`[DEBUG] ${currentApp} — ${currentTitle}`);

            if (previousApp !== null && (currentApp !== previousApp || currentTitle !== previousTitle)) {
                await flushCurrentWindow(true);
                startTime   = Date.now();
                lastSavedAt = startTime;
            }

            previousApp   = currentApp;
            previousTitle = currentTitle;
            await flushCurrentWindow(false);

        } catch (error) {
            console.error('Error tracking:', error.message);
        }
    }

    async function shutdown() {
        await flushCurrentWindow(true);
        process.exit(0);
    }

    process.on('SIGINT',  shutdown);
    process.on('SIGTERM', shutdown);

    setInterval(track, INTERVAL_MS);
    track(); // Run once immediately
}

main();
