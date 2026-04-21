const activeWin = require('active-win');
const fs = require('fs');
const path = require('path');

// --- CONFIGURATION ---
let config = {};
try {
    config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
} catch (error) {
    console.log('config.json not found, using environment variables');
}

const SERVER_URL = process.env.FOCUSFLOW_SERVER_URL || config.serverUrl || 'http://localhost:3000/api/track';
const SECRET_KEY = process.env.TRACKER_SECRET || config.secretKey || 'secure_key_123';
const TRACKER_TOKEN = process.env.FOCUSFLOW_TRACKER_TOKEN || config.trackerToken || '';
const USER_ID = Number(process.env.FOCUSFLOW_USER_ID || 1);
const INTERVAL_MS = Number(process.env.FOCUSFLOW_INTERVAL_MS || 10000);
const FLUSH_INTERVAL_MS = Number(process.env.FOCUSFLOW_FLUSH_INTERVAL_MS || 60000);

console.log("🔴 FocusFlow Tracker Started (Smart Mode)...");
console.log("Calculating accurate time. Press Ctrl+C to stop.");

// --- STATE VARIABLES ---
// We need to remember what we were doing previously to calculate time.
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
async function saveLog(app, title, category, duration) {
    try {
        const response = await fetch(SERVER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                secretKey: SECRET_KEY,
                trackerToken: TRACKER_TOKEN || undefined,
                userId: USER_ID,
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

async function flushCurrentWindow(force = false) {
    if (isFlushing || previousApp === null) {
        return;
    }

    const now = Date.now();
    const durationSeconds = Math.round((now - startTime) / 1000);
    const shouldFlush = force || (now - lastSavedAt >= FLUSH_INTERVAL_MS);

    if (!shouldFlush || durationSeconds <= 0) {
        return;
    }

    isFlushing = true;
    try {
        await saveLog(previousApp, previousTitle, getCategory(previousApp), durationSeconds);
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

        const currentApp = window.owner.name;
        const currentTitle = window.title || 'Untitled';
        console.log(`[DEBUG] Detected active window: ${currentApp} - ${currentTitle}`);

        if (previousApp !== null && (currentApp !== previousApp || currentTitle !== previousTitle)) {
            await flushCurrentWindow(true);
            startTime = Date.now();
            lastSavedAt = startTime;
        }

        previousApp = currentApp;
        previousTitle = currentTitle;
        await flushCurrentWindow(false);

    } catch (error) {
        console.error("Error tracking:", error.message);
    }
}

async function shutdown() {
    await flushCurrentWindow(true);
    process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

setInterval(track, INTERVAL_MS);
track(); // Run once immediately
