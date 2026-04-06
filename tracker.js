const activeWin = require('active-win');

// --- CONFIGURATION ---
const SERVER_URL = process.env.FOCUSFLOW_SERVER_URL || 'http://localhost:3000/api/track';
const SECRET_KEY = process.env.TRACKER_SECRET || 'secure_key_123';
const USER_ID = Number(process.env.FOCUSFLOW_USER_ID || 1);
const INTERVAL_MS = Number(process.env.FOCUSFLOW_INTERVAL_MS || 10000); // Check every 10 seconds

console.log("🔴 FocusFlow Tracker Started (Smart Mode)...");
console.log("Calculating accurate time. Press Ctrl+C to stop.");

// --- STATE VARIABLES ---
// We need to remember what we were doing previously to calculate time.
let previousApp = null;
let previousTitle = null;
let startTime = Date.now();

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
        await fetch(SERVER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                secretKey: SECRET_KEY,
                userId: USER_ID,
                app: app,
                title: title,
                category: category,
                duration: duration // Sending calculated duration in seconds
            })
        });
        console.log(`✅ Saved: ${app} (${Math.round(duration / 60)}m)`);
    } catch (error) {
        console.error("❌ Error saving:", error.message);
    }
}

async function track() {
    try {
        const window = await activeWin();
        if (!window) return;

        const currentApp = window.owner.name;
        const currentTitle = window.title;

        // CHECK: Did the user switch apps or windows?
        // We save data ONLY when switching, not every 10 seconds.
        if (previousApp !== null && (currentApp !== previousApp || currentTitle !== previousTitle)) {
            
            // CALCULATE: How much time passed since we started this task?
            const endTime = Date.now();
            const durationMs = endTime - startTime;
            const durationSeconds = Math.round(durationMs / 1000);

            // SAVE: Send the PREVIOUS task to the database
            await saveLog(previousApp, previousTitle, getCategory(previousApp), durationSeconds);

            // RESET: Start timing the new task
            startTime = Date.now();
        }

        // UPDATE: Remember what we are currently looking at
        previousApp = currentApp;
        previousTitle = currentTitle;

    } catch (error) {
        console.error("Error tracking:", error.message);
    }
}

// Start the loop
setInterval(track, INTERVAL_MS);
track(); // Run once immediately
