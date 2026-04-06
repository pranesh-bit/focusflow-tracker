// --- STATE ---
let currentUser = null;
let pieChartInstance = null;
let barChartInstance = null;

// --- DOM ---
const loginScreen = document.getElementById('login-screen');
const appContainer = document.getElementById('app-container');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const logoutBtn = document.getElementById('logout-btn');
const refreshBtn = document.getElementById('refresh-btn');
const clearBtn = document.getElementById('clear-btn');
const navLinks = document.querySelectorAll('.nav-link');
const pageSections = document.querySelectorAll('.page-section');
const menuToggle = document.getElementById('menu-toggle');
const sidebarOverlay = document.getElementById('sidebar-overlay');

// --- MOBILE MENU ---
function toggleSidebar() { document.body.classList.toggle('sidebar-open'); }
function closeSidebar() { document.body.classList.remove('sidebar-open'); }
menuToggle.addEventListener('click', toggleSidebar);
sidebarOverlay.addEventListener('click', closeSidebar);
navLinks.forEach(link => link.addEventListener('click', () => { if (window.innerWidth <= 768) closeSidebar(); }));

// --- AUTH ---
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password: pass })
        });
        const data = await response.json();

        if (response.ok) {
            currentUser = data.user;
            loginScreen.style.display = 'none';
            appContainer.style.display = 'block';
            document.querySelector('.user-name').innerText = currentUser.name;
            document.querySelector('.user-avatar').innerText = currentUser.name.split(' ').map(n => n[0]).join('');
            loadDashboardData();
        } else {
            loginError.innerText = data.error;
        }
    } catch (err) {
        loginError.innerText = "Server error.";
    }
});

logoutBtn.addEventListener('click', () => {
    currentUser = null;
    appContainer.style.display = 'none';
    loginScreen.style.display = 'flex';
    if (pieChartInstance) pieChartInstance.destroy();
    if (barChartInstance) barChartInstance.destroy();
});

refreshBtn.addEventListener('click', loadDashboardData);

// --- DELETE HISTORY ---
clearBtn.addEventListener('click', async () => {
    if(confirm("Are you sure you want to delete all history? This cannot be undone.")) {
        try {
            await fetch(`/api/logs/${currentUser.id}`, { method: 'DELETE' });
            loadDashboardData();
        } catch (err) {
            console.error("Error deleting logs:", err);
        }
    }
});

// --- DATA LOGIC ---
async function loadDashboardData() {
    if (!currentUser) return;
    const response = await fetch(`/api/logs/${currentUser.id}`);
    const logs = await response.json();

    renderStats(logs);
    renderCharts(logs);
    renderLogsTable(logs);
}

// --- RENDERING ---
function renderStats(logs) {
    let totalSeconds = 0;
    logs.forEach(log => totalSeconds += log.duration);
    
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    
    document.getElementById('stat-total').innerText = logs.length;
    document.getElementById('stat-productive').innerText = `${hours}h ${minutes}m`;
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
    const data = Object.values(categoryMap);

    pieChartInstance = new Chart(pieCtx, {
        type: 'doughnut',
        data: { labels, datasets: [{ data, backgroundColor: ['#4361ee', '#3a0ca3', '#ef476f', '#06d6a0', '#ffd166'], borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false }
    });

    barChartInstance = new Chart(barCtx, {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Minutes', data, backgroundColor: '#4361ee', borderRadius: 5 }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
    });
}

function renderLogsTable(logs) {
    const tbody = document.getElementById('logs-table-body');
    let html = '';
    
    if(logs.length === 0) {
        html = '<tr><td colspan="5" style="text-align:center">No logs yet. Start the tracker script!</td></tr>';
    } else {
        logs.slice().reverse().forEach(log => {
            // Convert seconds to Minutes and Seconds
            const mins = Math.floor(log.duration / 60);
            const secs = log.duration % 60;
            const durationStr = `${mins}m ${secs}s`;

            html += `
                <tr>
                    <td><strong>${log.app}</strong></td>
                    <td>${log.title}</td>
                    <td>${log.category}</td>
                    <td>${durationStr}</td>
                    <td>${log.time}</td>
                </tr>
            `;
        });
    }
    tbody.innerHTML = html;
}

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
