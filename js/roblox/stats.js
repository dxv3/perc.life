// ---- Roblox overlay: live game stats from the tracker backend ----
(() => {
    const overlay = document.getElementById("roblox-overlay");
    if (!overlay) return;

    const STATS_URL = "/tracking/api/stats";
    const REFRESH_MS = 5 * 60 * 1000;
    const TIMEFRAMES = [
        { key: "1h", label: "1H", ms: 3600e3 },
        { key: "6h", label: "6H", ms: 6 * 3600e3 },
        { key: "1d", label: "1D", ms: 86400e3 },
        { key: "3d", label: "3D", ms: 3 * 86400e3 },
        { key: "7d", label: "7D", ms: 7 * 86400e3 },
        { key: "14d", label: "14D", ms: 14 * 86400e3 },
        { key: "28d", label: "28D", ms: 28 * 86400e3 },
        { key: "56d", label: "56D", ms: 56 * 86400e3 },
        { key: "90d", label: "90D", ms: 90 * 86400e3 }
    ];
    const metrics = [
        { label: "Live Players", key: "playing", accent: "#a0c4ff" },
        { label: "Total Visits", key: "visits", accent: "#c4b5fd" },
        { label: "Favorites", key: "favorites", accent: "#f5a3c7" },
        { label: "Upvotes", key: "upVotes", accent: "#23a559" },
        { label: "Downvotes", key: "downVotes", accent: "#f23f43" },
        { label: "Like Ratio", key: "__ratio", accent: "#fcfcfc" },
        { label: "Active Servers", key: "servers", accent: "#ffd166" },
        { label: "Avg Players/Server", key: "__avgPerServer", accent: "#06d6a0" }
    ];
    const chartDefs = [
        { title: "Live Players", key: "playing", color: "#a0c4ff" },
        { title: "Visits", key: "visits", color: "#c4b5fd" },
        { title: "Favorites", key: "favorites", color: "#f5a3c7" }
    ];

    const fmt = n => n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : n;
    const deltaFmt = (cur, prev) => {
        if (cur == null || prev == null || prev === 0) return { text: "N/A", cls: "flat" };
        const pct = ((cur - prev) / prev * 100).toFixed(1);
        if (pct > 0) return { text: "↑ " + pct + "% · 24h", cls: "up" };
        if (pct < 0) return { text: "↓ " + Math.abs(pct) + "% · 24h", cls: "down" };
        return { text: "— 0% · 24h", cls: "flat" };
    };

    let allData = [];
    let activeRange = { type: "preset", key: "90d" };
    let charts = null;
    let controlsBuilt = false;
    let refreshTimer = null;
    let chartLibPromise = null;

    function loadChartLib() {
        if (window.Chart) return Promise.resolve();
        if (chartLibPromise) return chartLibPromise;
        chartLibPromise = new Promise((resolve, reject) => {
            const s = document.createElement("script");
            s.src = "https://unpkg.com/chart.js@4.5.1/dist/chart.umd.min.js";
            s.onload = resolve;
            s.onerror = reject;
            document.head.appendChild(s);
        });
        return chartLibPromise;
    }

    function setActiveRangeKey(key) {
        overlay.querySelectorAll("#t-rangeControls .range-pill").forEach(b => b.classList.toggle("active", b.dataset.key === key));
    }

    function renderRangeControls() {
        if (controlsBuilt) return;
        controlsBuilt = true;
        const el = document.getElementById("t-rangeControls");
        el.innerHTML = TIMEFRAMES.map(tf => `<button class="range-pill" data-key="${tf.key}">${tf.label}</button>`).join("")
            + '<button class="range-pill" data-key="custom">CUSTOM</button>';

        el.querySelectorAll(".range-pill").forEach(btn => {
            btn.addEventListener("click", () => {
                const key = btn.dataset.key;
                if (key === "custom") {
                    document.getElementById("t-customRange").classList.toggle("show");
                    setActiveRangeKey("custom");
                    return;
                }
                document.getElementById("t-customRange").classList.remove("show");
                activeRange = { type: "preset", key };
                setActiveRangeKey(key);
                applyRange();
            });
        });

        document.getElementById("t-applyCustom").addEventListener("click", () => {
            const fromVal = document.getElementById("t-customFrom").value;
            const toVal = document.getElementById("t-customTo").value;
            if (!fromVal || !toVal) return;
            activeRange = { type: "custom", from: new Date(fromVal).getTime(), to: new Date(toVal).getTime() };
            setActiveRangeKey("custom");
            applyRange();
        });
    }

    function filterByRange(data) {
        if (!data.length) return data;
        if (activeRange.type === "custom") {
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
        const rangeLabel = document.getElementById("t-rangeLabel");
        if (!filtered.length) {
            renderCharts(allData.slice(-1));
            rangeLabel.textContent = "no snapshots in this range · showing latest point · " + allData.length + " total";
            return;
        }
        renderCharts(filtered);
        const peak = Math.max(...filtered.map(d => d.playing));
        rangeLabel.textContent = filtered.length + " snapshots shown · peak " + fmt(peak) + " players · " + allData.length + " total · every 5 min";
    }

    function renderStatsGrid(latest, dayAgo) {
        document.getElementById("t-statsGrid").innerHTML = metrics.map(m => {
            if (m.key === "__ratio") {
                const total = latest.upVotes + latest.downVotes;
                const ratio = total > 0 ? Math.round(latest.upVotes / total * 100) + "%" : "N/A";
                return `<div class="stat">
                    <div class="label"><span class="dot" style="background:${m.accent}"></span>${m.label}</div>
                    <div class="value">${ratio}</div>
                </div>`;
            }
            if (m.key === "__avgPerServer") {
                const avg = latest.servers > 0 ? (latest.playing / latest.servers).toFixed(1) : "N/A";
                return `<div class="stat">
                    <div class="label"><span class="dot" style="background:${m.accent}"></span>${m.label}</div>
                    <div class="value">${avg}</div>
                </div>`;
            }
            const d = deltaFmt(latest[m.key], dayAgo[m.key]);
            return `<div class="stat">
                <div class="label"><span class="dot" style="background:${m.accent}"></span>${m.label}</div>
                <div class="value">${fmt(latest[m.key])}</div>
                <div class="delta ${d.cls}">${d.text}</div>
            </div>`;
        }).join("");
    }

    function renderCharts(data) {
        const labels = data.map(d => new Date(d.timestamp).toLocaleString());

        if (!charts) {
            const chartsDiv = document.getElementById("t-charts");
            charts = {};
            chartDefs.forEach(({ title, key, color }) => {
                const card = document.createElement("div");
                card.className = "chart-card";
                card.innerHTML = '<div class="chart-label">' + title + '</div><canvas height="80"></canvas>';
                chartsDiv.appendChild(card);
                charts[key] = new Chart(card.querySelector("canvas"), {
                    type: "line",
                    data: { labels, datasets: [{ label: title, data: data.map(d => d[key]), borderColor: color, backgroundColor: color + "1a", fill: true, tension: 0.35, pointRadius: 0, borderWidth: 2 }] },
                    options: {
                        responsive: true,
                        plugins: { legend: { display: false } },
                        interaction: { mode: "index", intersect: false },
                        scales: {
                            x: { ticks: { color: "#888888", maxTicksLimit: 8, font: { size: 11, family: "'JetBrains Mono', monospace" } }, grid: { color: "rgba(255,255,255,0.06)" } },
                            y: { ticks: { color: "#888888", font: { size: 11, family: "'JetBrains Mono', monospace" } }, grid: { color: "rgba(255,255,255,0.06)" } }
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
            chart.update("none");
        });
    }

    function renderHistoryTable(data) {
        const recent = data.slice(-10).reverse();
        document.getElementById("t-historyTable").innerHTML = `
            <tr><th>Time</th><th>Playing</th><th>Visits</th><th>Favorites</th><th>Upvotes</th><th>Downvotes</th></tr>
            ${recent.map(d => `<tr>
                <td>${new Date(d.timestamp).toLocaleString()}</td>
                <td>${d.playing}</td>
                <td>${fmt(d.visits)}</td>
                <td>${fmt(d.favorites)}</td>
                <td>${d.upVotes}</td>
                <td>${d.downVotes}</td>
            </tr>`).join("")}
        `;
    }

    function render(data) {
        allData = data;
        if (!data.length) {
            document.getElementById("t-statsGrid").innerHTML = '<div class="empty">no data yet — check back after the next poll cycle</div>';
            return;
        }
        const latest = data[data.length - 1];
        const dayAgo = data.find(d => new Date(latest.timestamp) - new Date(d.timestamp) >= 86400000) || data[0];

        document.getElementById("t-updated").textContent = "Last updated " + new Date(latest.timestamp).toLocaleString();

        renderStatsGrid(latest, dayAgo);
        renderRangeControls();
        setActiveRangeKey(activeRange.key || "custom");
        applyRange();
        renderHistoryTable(data);
        if (window.lucide) lucide.createIcons();
    }

    function refresh() {
        fetch(STATS_URL).then(r => r.json()).then(render).catch(err => console.error("tracking refresh failed", err));
    }

    function initTrackingView() {
        refresh();
        if (refreshTimer) clearInterval(refreshTimer);
        refreshTimer = setInterval(refresh, REFRESH_MS);
    }

    document.addEventListener("roblox:open", () => {
        loadChartLib().then(initTrackingView).catch(() => {
            document.getElementById("t-statsGrid").innerHTML = '<div class="empty">failed to load charts</div>';
        });
    });

    document.addEventListener("roblox:close", () => {
        if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
    });
})();
