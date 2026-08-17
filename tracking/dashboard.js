import http from 'http';
import fs from 'fs';

const DATA_FILE = '/opt/tracker/stats.jsonl';
const GAME_NAME = 'Check your Playtime & Stats!';
const GAME_URL = 'https://www.roblox.com/games/122298649618543/Check-your-Playtime-Stats';
const THUMBNAIL_URL = '';
const REFRESH_MS = 5 * 60 * 1000;

function loadStats() {
  if (!fs.existsSync(DATA_FILE)) return [];
  return fs.readFileSync(DATA_FILE, 'utf-8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

const server = http.createServer((req, res) => {
  if (req.url === '/api/stats') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(loadStats()));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${GAME_NAME} — Analytics</title>
<link href="https://fonts.googleapis.com/css2?family=Patrick+Hand&family=Outfit:wght@300;400;600;800&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
<script src="https://unpkg.com/lucide@latest"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js"></script>
<style>
  :root {
    --bg-dark: #050505;
    --accent: #a0c4ff;
    --accent-glow: rgba(160, 196, 255, 0.4);
    --text-main: #fcfcfc;
    --text-muted: #888888;
    --panel-bg: rgba(15, 15, 15, 0.55);
    --panel-border: rgba(255, 255, 255, 0.15);
    --card-bg: rgba(255, 255, 255, 0.02);
    --card-hover: rgba(255, 255, 255, 0.06);
    --up: #23a559;
    --down: #f23f43;

    --font-main: 'Outfit', sans-serif;
    --font-mono: 'JetBrains Mono', monospace;
    --font-sketch: 'Patrick Hand', cursive;

    --radius-sketch: 255px 15px 225px 15px/15px 225px 15px 255px;
    --transition: 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background-color: var(--bg-dark);
    color: var(--text-main);
    font-family: var(--font-main);
    min-height: 100vh;
    -webkit-font-smoothing: antialiased;
  }

  #noise {
    position: fixed;
    top: 0; left: 0; width: 100vw; height: 100vh;
    pointer-events: none;
    z-index: 999;
    opacity: 0.035;
    background: url('data:image/svg+xml,%3Csvg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"%3E%3Cfilter id="noiseFilter"%3E%3CfeTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch"/%3E%3C/filter%3E%3Crect width="100%25" height="100%25" filter="url(%23noiseFilter)"/%3E%3C/svg%3E');
  }

  #bg-container {
    position: fixed;
    inset: 0;
    z-index: -1;
    overflow: hidden;
    background: var(--bg-dark);
  }

  .blob {
    position: absolute;
    filter: blur(100px);
    border-radius: 50%;
    animation: drift 18s infinite alternate ease-in-out;
    opacity: 0.4;
  }
  .blob-1 { width: 450px; height: 450px; background: rgba(160, 196, 255, 0.15); top: -150px; left: -100px; }
  .blob-2 { width: 350px; height: 350px; background: rgba(100, 150, 255, 0.15); bottom: 5%; right: -50px; animation-delay: -5s; }
  .blob-3 { width: 300px; height: 300px; background: rgba(200, 220, 255, 0.10); top: 45%; left: 40%; animation-delay: -10s; }

  @keyframes drift { 100% { transform: translate(60px, 60px) scale(1.15); } }

  .topbar {
    border-bottom: 1px solid var(--panel-border);
    padding: 16px 28px;
    display: flex; align-items: center; gap: 10px;
    position: relative; z-index: 10;
  }
  .topbar .dot {
    width: 8px; height: 8px; border-radius: 50%; background: var(--accent);
    box-shadow: 0 0 8px var(--accent-glow);
    animation: pulseDot 2s ease-in-out infinite;
  }
  @keyframes pulseDot { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
  .topbar .brand {
    font-family: var(--font-sketch);
    font-size: 1.3rem;
    letter-spacing: 1px;
    color: var(--text-main);
  }

  .wrap { max-width: 1120px; margin: 0 auto; padding: 40px 24px 60px; position: relative; z-index: 10; }

  .hero.glass-panel {
    margin-bottom: 32px;
    max-width: none;
    align-items: flex-start;
    padding: 2rem 2.2rem;
  }
  .hero h1 {
    font-family: var(--font-sketch);
    font-weight: 400;
    font-size: 2.2rem;
    letter-spacing: 1px;
    margin-bottom: 10px;
  }
  .hero .meta {
    font-family: var(--font-mono);
    font-size: 0.8rem;
    color: var(--text-muted);
    display: flex; align-items: center; gap: 6px;
    margin-bottom: 14px;
  }
  .hero .meta i { width: 14px; height: 14px; color: var(--accent); }

  .hero-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }

  .play-link {
    display: inline-flex; align-items: center; gap: 6px;
    font-family: var(--font-mono); font-size: 0.75rem; font-weight: 600;
    color: var(--accent); text-decoration: none;
    background: rgba(160, 196, 255, 0.08); padding: 4px 12px; border-radius: 20px;
    border: 1px solid rgba(160, 196, 255, 0.3);
    transition: var(--transition);
  }
  .play-link:hover { background: rgba(160,196,255,0.18); border-color: rgba(160,196,255,0.5); box-shadow: 0 0 12px var(--accent-glow); }
  .play-link i { width: 13px; height: 13px; }

  .badge {
    display: inline-flex; align-items: center; gap: 6px; font-size: 0.75rem; font-weight: 600;
    background: rgba(160, 196, 255, 0.08); color: var(--accent); padding: 4px 12px; border-radius: 20px;
    border: 1px solid rgba(160, 196, 255, 0.2);
  }
  .badge::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--accent); }

  .glass-panel {
    background: var(--panel-bg);
    backdrop-filter: blur(25px);
    -webkit-backdrop-filter: blur(25px);
    border: 2px solid var(--panel-border);
    border-radius: var(--radius-sketch);
    box-shadow: 0 0 40px var(--accent-glow), inset 0 1px 0 rgba(255,255,255,0.08);
  }

  .stats-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 14px;
    margin-bottom: 44px;
  }
  .stat {
    background: var(--card-bg);
    border: 2px solid var(--panel-border);
    border-radius: var(--radius-sketch);
    padding: 20px 22px;
    transition: var(--transition);
  }
  .stat:hover { background: var(--card-hover); border-color: rgba(255,255,255,0.3); transform: translateY(-2px); box-shadow: 0 10px 20px rgba(0,0,0,0.25); }
  .stat .label {
    font-family: var(--font-mono);
    font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em;
    display: flex; align-items: center; gap: 6px;
  }
  .stat .dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
  .stat .value { font-size: 30px; font-weight: 800; margin-top: 10px; color: var(--text-main); letter-spacing: -0.01em; }
  .stat .delta { font-family: var(--font-mono); font-size: 12px; margin-top: 8px; font-weight: 600; }
  .delta.up { color: var(--up); }
  .delta.down { color: var(--down); }
  .delta.flat { color: var(--text-muted); }

  .section-head {
    display: flex; align-items: baseline; justify-content: space-between;
    margin: 8px 0 16px;
    flex-wrap: wrap; gap: 10px;
  }
  .section-title { font-family: var(--font-sketch); font-size: 1.4rem; letter-spacing: 0.5px; color: var(--text-main); }
  .section-sub { font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); margin-bottom: 14px; }

  .range-controls { display: flex; flex-wrap: wrap; gap: 8px; }
  .range-pill {
    font-family: var(--font-mono); font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em;
    padding: 6px 14px; border-radius: 20px; border: 1px solid var(--panel-border);
    background: var(--card-bg); color: var(--text-muted);
    cursor: pointer; transition: var(--transition);
  }
  .range-pill:hover { border-color: rgba(255,255,255,0.3); color: var(--text-main); }
  .range-pill.active {
    background: rgba(160,196,255,0.12); border-color: rgba(160,196,255,0.4); color: var(--accent);
    box-shadow: 0 0 12px var(--accent-glow);
  }

  .custom-range {
    display: none; align-items: flex-end; gap: 14px; flex-wrap: wrap;
    margin: 12px 0 16px; padding: 14px 18px;
    background: var(--card-bg); border: 1px solid var(--panel-border); border-radius: 16px;
  }
  .custom-range.show { display: flex; }
  .custom-range label {
    font-family: var(--font-mono); font-size: 10.5px; color: var(--text-muted);
    text-transform: uppercase; letter-spacing: 0.04em; display: flex; flex-direction: column; gap: 5px;
  }
  .custom-range input[type="datetime-local"] {
    background: rgba(0,0,0,0.3); border: 1px solid var(--panel-border); border-radius: 8px;
    padding: 7px 9px; color: var(--text-main); font-family: var(--font-mono); font-size: 12px;
    color-scheme: dark;
  }
  .custom-range button {
    font-family: var(--font-mono); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;
    padding: 8px 18px; border-radius: 20px; border: 1px solid rgba(160,196,255,0.4);
    background: rgba(160,196,255,0.12); color: var(--accent); cursor: pointer; transition: var(--transition);
  }
  .custom-range button:hover { background: rgba(160,196,255,0.2); }

  .chart-card {
    background: var(--card-bg);
    border: 2px solid var(--panel-border);
    border-radius: 24px;
    padding: 24px;
    margin-bottom: 16px;
    backdrop-filter: blur(15px);
  }
  .chart-card .chart-label {
    font-family: var(--font-mono);
    font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
    color: var(--text-muted); margin-bottom: 16px;
  }

  .table-card { padding: 8px 24px; margin-top: 8px; overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 13px 12px; border-bottom: 1px dashed rgba(255,255,255,0.15); }
  th {
    font-family: var(--font-mono);
    color: var(--text-muted); font-weight: 700; text-transform: uppercase; font-size: 10.5px; letter-spacing: 0.05em;
  }
  td { color: var(--text-main); font-family: var(--font-mono); font-size: 12.5px; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: rgba(255,255,255,0.03); }

  .empty { text-align: center; color: var(--text-muted); padding: 80px 0; font-family: var(--font-sketch); font-size: 1.3rem; }

  @media (max-width: 640px) {
    .hero.glass-panel { padding: 1.6rem 1.4rem; }
    .wrap { padding: 28px 16px 40px; }
  }
</style>
</head>
<body>
  <div id="noise"></div>
  <div id="bg-container">
    <div class="blob blob-1"></div>
    <div class="blob blob-2"></div>
    <div class="blob blob-3"></div>
  </div>

  <div class="topbar">
    <div class="dot"></div>
    <div class="brand">dxv3 · tracking</div>
  </div>

  <div class="wrap">
    <div class="hero glass-panel">
      <h1>${GAME_NAME}</h1>
      <div class="meta"><i data-lucide="clock"></i><span id="updated">Loading…</span></div>
      <div class="hero-actions">
        <span class="badge">Tracking Live</span>
        <a href="${GAME_URL}" target="_blank" rel="noopener" class="play-link">
          <i data-lucide="gamepad-2"></i> Play Game
        </a>
      </div>
    </div>

    <div class="stats-row" id="statsGrid"></div>

    <div class="section-head">
      <div class="section-title">Trends</div>
      <div class="range-controls" id="rangeControls"></div>
    </div>
    <div class="custom-range" id="customRange">
      <label>From <input type="datetime-local" id="customFrom"></label>
      <label>To <input type="datetime-local" id="customTo"></label>
      <button id="applyCustom">Apply</button>
    </div>
    <div class="section-sub" id="rangeLabel"></div>
    <div id="charts"></div>

    <div class="section-head" style="margin-top:32px">
      <div class="section-title">Recent Snapshots</div>
    </div>
    <div class="glass-panel table-card"><table id="historyTable"></table></div>
  </div>

<script>
const REFRESH_MS = ${REFRESH_MS};
const fmt = n => n >= 1e6 ? (n/1e6).toFixed(2)+'M' : n >= 1e3 ? (n/1e3).toFixed(1)+'K' : n;
const deltaFmt = (cur, prev) => {
  if (prev === 0) return { text: 'N/A', cls: 'flat' };
  const pct = ((cur - prev) / prev * 100).toFixed(1);
  if (pct > 0) return { text: '↑ ' + pct + '% · 24h', cls: 'up' };
  if (pct < 0) return { text: '↓ ' + Math.abs(pct) + '% · 24h', cls: 'down' };
  return { text: '— 0% · 24h', cls: 'flat' };
};

const metrics = [
  { label: 'Live Players', key: 'playing', accent: '#a0c4ff' },
  { label: 'Total Visits', key: 'visits', accent: '#c4b5fd' },
  { label: 'Favorites', key: 'favorites', accent: '#f5a3c7' },
  { label: 'Upvotes', key: 'upVotes', accent: '#23a559' },
  { label: 'Downvotes', key: 'downVotes', accent: '#f23f43' },
  { label: 'Like Ratio', key: '__ratio', accent: '#fcfcfc' }
];

const chartDefs = [
  { title: 'Live Players', key: 'playing', color: '#a0c4ff' },
  { title: 'Visits', key: 'visits', color: '#c4b5fd' },
  { title: 'Favorites', key: 'favorites', color: '#f5a3c7' }
];

const TIMEFRAMES = [
  { key: '1h', label: '1H', ms: 3600e3 },
  { key: '6h', label: '6H', ms: 6 * 3600e3 },
  { key: '1d', label: '1D', ms: 86400e3 },
  { key: '3d', label: '3D', ms: 3 * 86400e3 },
  { key: '7d', label: '7D', ms: 7 * 86400e3 },
  { key: '14d', label: '14D', ms: 14 * 86400e3 },
  { key: '28d', label: '28D', ms: 28 * 86400e3 },
  { key: '56d', label: '56D', ms: 56 * 86400e3 },
  { key: '90d', label: '90D', ms: 90 * 86400e3 }
];

let charts = null;
let allData = [];
let activeRange = { type: 'preset', key: '90d' };
let controlsBuilt = false;

function setActiveRangeKey(key) {
  document.querySelectorAll('.range-pill').forEach(b => b.classList.toggle('active', b.dataset.key === key));
}

function renderRangeControls() {
  if (controlsBuilt) return;
  controlsBuilt = true;
  const el = document.getElementById('rangeControls');
  el.innerHTML = TIMEFRAMES.map(tf => \`<button class="range-pill" data-key="\${tf.key}">\${tf.label}</button>\`).join('')
    + '<button class="range-pill" data-key="custom">CUSTOM</button>';

  el.querySelectorAll('.range-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      if (key === 'custom') {
        document.getElementById('customRange').classList.toggle('show');
        setActiveRangeKey('custom');
        return;
      }
      document.getElementById('customRange').classList.remove('show');
      activeRange = { type: 'preset', key };
      setActiveRangeKey(key);
      applyRange();
    });
  });

  document.getElementById('applyCustom').addEventListener('click', () => {
    const fromVal = document.getElementById('customFrom').value;
    const toVal = document.getElementById('customTo').value;
    if (!fromVal || !toVal) return;
    activeRange = { type: 'custom', from: new Date(fromVal).getTime(), to: new Date(toVal).getTime() };
    setActiveRangeKey('custom');
    applyRange();
  });
}

function filterByRange(data) {
  if (!data.length) return data;
  if (activeRange.type === 'custom') {
    if (activeRange.from == null || activeRange.to == null) return data;
    return data.filter(d => {
      const t = new Date(d.timestamp).getTime();
      return t >= activeRange.from && t <= activeRange.to;
    });
  }
  const tf = TIMEFRAMES.find(t => t.key === activeRange.key);
  if (!tf) return data;
  const cutoff = Date.now() - tf.ms;
  return data.filter(d => new Date(d.timestamp).getTime() >= cutoff);
}

function applyRange() {
  if (!allData.length) return;
  const filtered = filterByRange(allData);
  if (!filtered.length) {
    renderCharts(allData.slice(-1));
    document.getElementById('rangeLabel').textContent = 'no snapshots in this range · showing latest point · ' + allData.length + ' total';
    return;
  }
  renderCharts(filtered);
  document.getElementById('rangeLabel').textContent = filtered.length + ' snapshots shown · ' + allData.length + ' total · every 5 min';
}

function renderStatsGrid(latest, dayAgo) {
  document.getElementById('statsGrid').innerHTML = metrics.map(m => {
    if (m.key === '__ratio') {
      const total = latest.upVotes + latest.downVotes;
      const ratio = total > 0 ? Math.round(latest.upVotes / total * 100) + '%' : 'N/A';
      return \`<div class="stat">
        <div class="label"><span class="dot" style="background:\${m.accent}"></span>\${m.label}</div>
        <div class="value">\${ratio}</div>
      </div>\`;
    }
    const d = deltaFmt(latest[m.key], dayAgo[m.key]);
    return \`<div class="stat">
      <div class="label"><span class="dot" style="background:\${m.accent}"></span>\${m.label}</div>
      <div class="value">\${fmt(latest[m.key])}</div>
      <div class="delta \${d.cls}">\${d.text}</div>
    </div>\`;
  }).join('');
}

function renderCharts(data) {
  const labels = data.map(d => new Date(d.timestamp).toLocaleString());

  if (!charts) {
    const chartsDiv = document.getElementById('charts');
    charts = {};
    chartDefs.forEach(({ title, key, color }) => {
      const card = document.createElement('div');
      card.className = 'chart-card';
      card.innerHTML = '<div class="chart-label">' + title + '</div><canvas height="80"></canvas>';
      chartsDiv.appendChild(card);
      charts[key] = new Chart(card.querySelector('canvas'), {
        type: 'line',
        data: { labels, datasets: [{ label: title, data: data.map(d => d[key]), borderColor: color, backgroundColor: color + '1a', fill: true, tension: 0.35, pointRadius: 0, borderWidth: 2 }] },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          interaction: { mode: 'index', intersect: false },
          scales: {
            x: { ticks: { color: '#888888', maxTicksLimit: 8, font: { size: 11, family: "'JetBrains Mono', monospace" } }, grid: { color: 'rgba(255,255,255,0.06)' } },
            y: { ticks: { color: '#888888', font: { size: 11, family: "'JetBrains Mono', monospace" } }, grid: { color: 'rgba(255,255,255,0.06)' } }
          }
        }
      });
    });
    return;
  }

  chartDefs.forEach(({ key }) => {
    const chart = charts[key];
    chart.data.labels = labels;
    chart.data.datasets[0].data = data.map(d => d[key]);
    chart.update('none');
  });
}

function renderHistoryTable(data) {
  const recent = data.slice(-10).reverse();
  document.getElementById('historyTable').innerHTML = \`
    <tr><th>Time</th><th>Playing</th><th>Visits</th><th>Favorites</th><th>Upvotes</th><th>Downvotes</th></tr>
    \${recent.map(d => \`<tr>
      <td>\${new Date(d.timestamp).toLocaleString()}</td>
      <td>\${d.playing}</td>
      <td>\${fmt(d.visits)}</td>
      <td>\${fmt(d.favorites)}</td>
      <td>\${d.upVotes}</td>
      <td>\${d.downVotes}</td>
    </tr>\`).join('')}
  \`;
}

function render(data) {
  allData = data;
  if (!data.length) {
    document.getElementById('statsGrid').innerHTML = '<div class="empty">no data yet — check back after the next poll cycle</div>';
    return;
  }

  const latest = data[data.length - 1];
  const dayAgo = data.find(d => new Date(latest.timestamp) - new Date(d.timestamp) >= 86400000) || data[0];

  document.getElementById('updated').textContent = 'Last updated ' + new Date(latest.timestamp).toLocaleString();

  renderStatsGrid(latest, dayAgo);
  renderRangeControls();
  setActiveRangeKey(activeRange.key || 'custom');
  applyRange();
  renderHistoryTable(data);
  if (window.lucide) lucide.createIcons();
}

function refresh() {
  fetch('api/stats').then(r => r.json()).then(render).catch(err => console.error('refresh failed', err));
}

if (window.lucide) lucide.createIcons();
refresh();
setInterval(refresh, REFRESH_MS);
</script>
</body>
</html>
  `);
});

server.listen(3000, () => console.log('Dashboard running on port 3000'));
