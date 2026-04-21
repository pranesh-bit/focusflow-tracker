// --- STATE ---
let currentUser = null;
let pieChartInstance = null;
let barChartInstance = null;
let authMode = 'login';
let allLogsData = []; // Store raw logs for filtering

// --- DOM ---
const loginScreen = document.getElementById('login-screen');
const appContainer = document.getElementById('app-container');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const authSubtitle = document.getElementById('auth-subtitle');
const signupNameGroup = document.getElementById('signup-name-group');
const signupNameInput = document.getElementById('signup-name');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const authToggleBtn = document.getElementById('auth-toggle-btn');
const logoutBtn = document.getElementById('logout-btn');
const refreshBtn = document.getElementById('refresh-btn');
const clearBtn = document.getElementById('clear-btn');
const trackerTokenInput = document.getElementById('tracker-token');
const copyTokenBtn = document.getElementById('copy-token-btn');
const navLinks = document.querySelectorAll('.nav-link');
const pageSections = document.querySelectorAll('.page-section');
const menuToggle = document.getElementById('menu-toggle');
const sidebarOverlay = document.getElementById('sidebar-overlay');

// Filters
const filterApp = document.getElementById('filter-app');
const filterCategory = document.getElementById('filter-category');

// --- MOBILE MENU ---
function toggleSidebar() { document.body.classList.toggle('sidebar-open'); }
function closeSidebar() { document.body.classList.remove('sidebar-open'); }
menuToggle.addEventListener('click', toggleSidebar);
sidebarOverlay.addEventListener('click', closeSidebar);
navLinks.forEach(link => link.addEventListener('click', () => { if (window.innerWidth <= 768) closeSidebar(); }));

// --- AUTH ---
function setAuthMode(mode) {
    authMode = mode;
    const isSignup = mode === 'signup';
    signupNameGroup.style.display = isSignup ? 'block' : 'none';
    authSubtitle.innerText = isSignup ? 'Create your account to start tracking' : 'Login to monitor your productivity';
    authSubmitBtn.innerText = isSignup ? 'Create Account' : 'Login';
    authToggleBtn.innerText = isSignup ? 'Already have an account? Login' : 'Create a new account';
    loginError.innerText = '';
}

function applyAuthenticatedUser(user) {
    currentUser = user;
    loginScreen.style.display = 'none';
    appContainer.style.display = 'block';
    document.querySelector('.user-name').innerText = currentUser.name;
    
    // Set Avatar Initials
    const initials = currentUser.name.split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase();
    document.getElementById('user-avatar').innerText = initials;
    
    trackerTokenInput.value = currentUser.trackerToken || '';
    loadDashboardData();
}

async function restoreSession() {
    try {
        const response = await fetch('/api/me');
        if (!response.ok) return;
        const data = await response.json();
        applyAuthenticatedUser(data.user);
    } catch (error) {
        console.error('Session restore failed:', error);
    }
}

authToggleBtn.addEventListener('click', () => {
    setAuthMode(authMode === 'login' ? 'signup' : 'login');
});

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim().toLowerCase();
    const pass = document.getElementById('login-password').value;
    const name = signupNameInput.value.trim();
    const endpoint = authMode === 'signup' ? '/api/signup' : '/api/login';
    const payload = authMode === 'signup'
        ? { name, email, password: pass }
        : { email, password: pass };

    const btnOgText = authSubmitBtn.innerText;
    authSubmitBtn.innerText = "Processing...";
    
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json();

        if (response.ok) {
            applyAuthenticatedUser(data.user);
        } else {
            loginError.innerText = data.error;
        }
    } catch (err) {
        loginError.innerText = "Server error.";
    } finally {
        authSubmitBtn.innerText = btnOgText;
    }
});

logoutBtn.addEventListener('click', () => {
    fetch('/api/logout', { method: 'POST' }).finally(() => {
        currentUser = null;
        appContainer.style.display = 'none';
        loginScreen.style.display = 'flex';
        if (pieChartInstance) pieChartInstance.destroy();
        if (barChartInstance) barChartInstance.destroy();
    });
});

copyTokenBtn.addEventListener('click', async () => {
    if (!trackerTokenInput.value) return;
    await navigator.clipboard.writeText(trackerTokenInput.value);
    copyTokenBtn.innerText = '✅ Copied!';
    setTimeout(() => {
        copyTokenBtn.innerText = 'Copy Token';
    }, 1500);
});

refreshBtn.addEventListener('click', () => {
    const icon = refreshBtn.innerText;
    refreshBtn.innerText = "Refreshing...";
    loadDashboardData().finally(() => refreshBtn.innerText = "🔄 Refresh Data");
});

// --- DELETE HISTORY ---
clearBtn.addEventListener('click', async () => {
    if(confirm("Are you sure you want to delete all tracking history? This cannot be undone.")) {
        try {
            await fetch('/api/logs', { method: 'DELETE' });
            loadDashboardData();
        } catch (err) {
            console.error("Error deleting logs:", err);
        }
    }
});

// --- DATA LOGIC ---
async function loadDashboardData() {
    if (!currentUser) return;
    try {
        const response = await fetch('/api/logs');
        if (!response.ok) throw new Error(`API Error: ${response.status}`);
        allLogsData = await response.json();

        renderStats(allLogsData);
        renderCharts(allLogsData);
        renderDashboardLogs(allLogsData);
        renderLogsTable(); // Uses allLogsData and applies filters
    } catch (error) {
        console.error('Failed to load dashboard data:', error);
        document.getElementById('dashboard-logs-body').innerHTML = '<tr><td colspan="5" style="text-align:center; color: #f43f5e;">Failed to load logs.</td></tr>';
        document.getElementById('logs-table-body').innerHTML = '<tr><td colspan="5" style="text-align:center; color: #f43f5e;">Failed to load logs.</td></tr>';
    }
}

// Helpers
function getCategoryBadge(category) {
    const cat = category.toLowerCase();
    if (cat === 'development') return '<span class="badge badge-dev">Development</span>';
    if (cat === 'communication') return '<span class="badge badge-comm">Communication</span>';
    if (cat === 'entertainment') return '<span class="badge badge-ent">Entertainment</span>';
    if (cat === 'browsing') return '<span class="badge badge-browse">Browsing</span>';
    return '<span class="badge badge-other">Other</span>';
}

function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) return `${hours}h ${mins}m`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
}

// --- RENDERING ---
function renderStats(logs) {
    let totalSeconds = 0;
    let productiveSeconds = 0;

    logs.forEach(log => {
        totalSeconds += log.duration;
        const cat = log.category.toLowerCase();
        // Assume Dev and Comm are strictly productive
        if (cat === 'development' || cat === 'communication') {
            productiveSeconds += log.duration;
        } else if (cat === 'browsing') {
            // Neutral, slight productive weight (0.2)
            productiveSeconds += log.duration * 0.2;
        }
    });

    // Handle Total Authenticated Time
    document.getElementById('stat-productive').innerText = formatDuration(totalSeconds);

    // Provide Score
    const scoreBox = document.getElementById('score-cardbox');
    const scoreVal = document.getElementById('stat-score');
    if (totalSeconds === 0) {
        scoreVal.innerText = '0%';
        scoreVal.classList.remove('low');
        scoreBox.classList.remove('low');
    } else {
        const percentage = Math.round((productiveSeconds / totalSeconds) * 100);
        scoreVal.innerText = `${percentage}%`;
        if (percentage < 40) {
            scoreVal.classList.add('low');
            scoreBox.classList.add('low');
        } else {
            scoreVal.classList.remove('low');
            scoreBox.classList.remove('low');
        }
    }
}

function renderCharts(logs) {
    const pieCtx = document.getElementById('pieChart').getContext('2d');
    const barCtx = document.getElementById('barChart').getContext('2d');
    if (pieChartInstance) pieChartInstance.destroy();
    if (barChartInstance) barChartInstance.destroy();

    const categoryMap = {};
    logs.forEach(log => {
        if (!categoryMap[log.category]) categoryMap[log.category] = 0;
        categoryMap[log.category] += log.duration;
    });

    const labels = Object.keys(categoryMap);
    const data = Object.values(categoryMap).map(s => (s / 60).toFixed(2)); // convert to minutes

    // Dark theme compatible colors
    const colors = {
        'Development': 'rgba(99, 102, 241, 0.8)',
        'Communication': 'rgba(168, 85, 247, 0.8)',
        'Entertainment': 'rgba(244, 63, 94, 0.8)',
        'Browsing': 'rgba(16, 185, 129, 0.8)',
        'Other': 'rgba(148, 163, 184, 0.8)'
    };
    
    const bgColors = labels.map(l => colors[l] || colors['Other']);

    pieChartInstance = new Chart(pieCtx, {
        type: 'doughnut',
        data: { labels, datasets: [{ data, backgroundColor: bgColors, borderWidth: 0, hoverOffset: 4 }] },
        options: { 
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#f8fafc', font: { family: 'Inter' } } }
            }
        }
    });

    barChartInstance = new Chart(barCtx, {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Minutes', data, backgroundColor: bgColors, borderRadius: 6 }] },
        options: { 
            responsive: true, maintainAspectRatio: false, 
            plugins: {
                legend: { display: false }
            },
            scales: { 
                y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
                x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
            } 
        }
    });
}

function renderDashboardLogs(logs) {
    const tbody = document.getElementById('dashboard-logs-body');
    let html = '';
    
    if(logs.length === 0) {
        html = '<tr><td colspan="5" style="text-align:center; padding: 30px; color: #94a3b8;">No activity monitored today. Start your tracker script!</td></tr>';
    } else {
        logs.slice(-5).reverse().forEach(log => {
            html += `
                <tr>
                    <td style="color: #e2e8f0; font-weight: 500;">${log.app}</td>
                    <td style="color: #94a3b8;">${log.title}</td>
                    <td>${getCategoryBadge(log.category)}</td>
                    <td style="color: #e2e8f0;">${formatDuration(log.duration)}</td>
                    <td style="color: #94a3b8;">${log.time}</td>
                </tr>
            `;
        });
    }
    tbody.innerHTML = html;
}

function renderLogsTable() {
    const tbody = document.getElementById('logs-table-body');
    if (!tbody) return;
    
    const appFilter = filterApp.value.toLowerCase();
    const catFilter = filterCategory.value;

    let filtered = allLogsData.filter(log => {
        let matchApp = log.app.toLowerCase().includes(appFilter) || log.title.toLowerCase().includes(appFilter);
        let matchCat = catFilter === 'All' || log.category === catFilter;
        return matchApp && matchCat;
    });

    let html = '';
    if(filtered.length === 0) {
        html = '<tr><td colspan="5" style="text-align:center; padding: 30px; color: #94a3b8;">No matching logs found.</td></tr>';
    } else {
        [...filtered].reverse().forEach(log => {
            html += `
                <tr>
                    <td style="color: #e2e8f0; font-weight: 500;">${log.app}</td>
                    <td style="color: #94a3b8; max-width: 300px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${log.title}">${log.title}</td>
                    <td>${getCategoryBadge(log.category)}</td>
                    <td style="color: #e2e8f0;">${formatDuration(log.duration)}</td>
                    <td style="color: #94a3b8;">${log.date || ''} ${log.time}</td>
                </tr>
            `;
        });
    }
    tbody.innerHTML = html;
}

// Filter listeners
filterApp.addEventListener('input', renderLogsTable);
filterCategory.addEventListener('change', renderLogsTable);

// --- ROUTING ---
navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const page = link.getAttribute('data-page');
        pageSections.forEach(s => s.classList.remove('active'));
        document.getElementById(`page-${page}`).classList.add('active');
        navLinks.forEach(l => l.classList.remove('active'));
        link.classList.add('active');
    });
});

setAuthMode('login');
restoreSession();
