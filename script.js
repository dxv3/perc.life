document.addEventListener("DOMContentLoaded", () => {
    lucide.createIcons();

    const overlay = document.getElementById("entry-overlay");
    const mainPanel = document.getElementById("main-panel");
    const bgVideo = document.getElementById("bg-video");

    const fonts = ["'Patrick Hand', cursive", "'Caveat', cursive", "'Kalam', cursive", "'Shadows Into Light', cursive", "'Permanent Marker', cursive", "'Outfit', sans-serif"];
    const charSpans = ["char-1","char-2","char-3","char-4"].map(id => document.getElementById(id)).filter(Boolean);
    if(charSpans.length > 0) {
        setInterval(() => {
            charSpans.forEach(el => { el.style.fontFamily = fonts[Math.floor(Math.random() * fonts.length)]; });
        }, 350);
    }

    const phrases = ["i <3 claude", "roblox fullstacker", "yo", "yay"];
    const typewriterEl = document.getElementById("typewriter");
    let phraseIndex = 0;
    let charIndex = 0;
    let isDeleting = false;
    let isWaiting = false;

    function renderTypewriter() {
        const currentPhrase = phrases[phraseIndex];
        let delay = isDeleting ? 30 : 50;
        delay += Math.random() * 20 - 10;

        if (!isWaiting) {
            if (isDeleting) {
                typewriterEl.textContent = currentPhrase.substring(0, charIndex - 1);
                charIndex--;
            } else {
                typewriterEl.textContent = currentPhrase.substring(0, charIndex + 1);
                charIndex++;
            }

            if (!isDeleting && charIndex === currentPhrase.length) {
                isWaiting = true;
                setTimeout(() => {
                    isDeleting = true;
                    isWaiting = false;
                    renderTypewriter();
                }, 1800);
                return;
            } else if (isDeleting && charIndex === 0) {
                isDeleting = false;
                phraseIndex = (phraseIndex + 1) % phrases.length;
            }
        }
        setTimeout(renderTypewriter, delay);
    }

    let audioInstance = null;
    let isMuted = false;

    let tracks = window.siteFiles && window.siteFiles.tracks ? window.siteFiles.tracks.map(f => 'music/' + f) : [];
    if (tracks.length > 0) {
        tracks = tracks.sort(() => Math.random() - 0.5);
    }
    let currentTrackIndex = 0;
    
    const pfp = document.getElementById("pfp");
    if (window.siteFiles && window.siteFiles.images && window.siteFiles.images.length > 0) {
        const rImg = window.siteFiles.images[Math.floor(Math.random() * window.siteFiles.images.length)];
        pfp.src = 'images/' + rImg;
    }
    
    const charGif = document.getElementById("character-gif");
    if (window.siteFiles && window.siteFiles.characters && window.siteFiles.characters.length > 0) {
        const rChar = window.siteFiles.characters[Math.floor(Math.random() * window.siteFiles.characters.length)];
        charGif.src = 'characters/' + rChar;
    }
    
    const trackNameEl = document.getElementById("track-name");
    const muteBtn = document.getElementById("mute-toggle");
    const nextBtn = document.getElementById("next-track");
    const prevBtn = document.getElementById("prev-track");
    const volIcon = document.getElementById("vol-icon");
    const visualizer = document.getElementById("visualizer");
    const spinDisc = document.querySelector(".spin-slow");

    let audioCtx;
    let analyser;
    let dataArray;
    let source;
    let bassVisualsActive = false;
    let animationFrameId;

    function initAudioContext() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (!analyser) {
            analyser = audioCtx.createAnalyser();
            analyser.fftSize = 256;
            dataArray = new Uint8Array(analyser.frequencyBinCount);
        }
        if (!source && audioInstance) {
            source = audioCtx.createMediaElementSource(audioInstance);
            source.connect(analyser);
            analyser.connect(audioCtx.destination);
        }
    }

    function renderBass() {
        if (!bassVisualsActive) return;
        animationFrameId = requestAnimationFrame(renderBass);
        
        analyser.getByteFrequencyData(dataArray);

        let sum = 0;
        const bassBins = 5;
        for (let i = 0; i < bassBins; i++) {
            sum += dataArray[i];
        }
        const avgBass = sum / bassBins;

        const pfpContainer = document.querySelector(".pfp-container");
        const panel = document.getElementById("main-panel");
        
        if (avgBass > 180) {
            document.body.classList.add("bass-flash-bg");
            pfpContainer.style.boxShadow = "0 0 60px var(--accent)";
            pfpContainer.style.transform = "scale(1.08)";
            panel.style.boxShadow = "0 0 80px var(--accent-glow), inset 0 1px 0 rgba(255,255,255,0.08)";
        } else {
            document.body.classList.remove("bass-flash-bg");
            pfpContainer.style.boxShadow = "0 0 20px var(--accent-glow)";
            pfpContainer.style.transform = "scale(1)";
            panel.style.boxShadow = "0 0 40px var(--accent-glow), inset 0 1px 0 rgba(255,255,255,0.08)";
        }
    }

    function initAudio() {
        if (!audioInstance) {
            audioInstance = new Audio();
            audioInstance.crossOrigin = "anonymous";
            audioInstance.volume = 0;
            audioInstance.addEventListener('ended', () => handleTrackChange(1));
            audioInstance.addEventListener('error', () => {
                trackNameEl.textContent = "error loading local files";
                stopVisuals();
            });
        }
    }

    function playTrack() {
        if (!audioInstance) initAudio();
        if (tracks.length === 0) {
            trackNameEl.textContent = "folder empty";
            return;
        }

        audioInstance.src = tracks[currentTrackIndex];
        let p = audioInstance.play();
        if (p !== undefined) {
            p.then(() => {
                if(audioCtx && audioCtx.state === 'suspended') {
                    audioCtx.resume();
                }
                let rawName = tracks[currentTrackIndex].split('/').pop();
                // cleanup the messy string names
                const cleanName = rawName.replace('_spotdown.org', '').replace('.mp3', '');
                trackNameEl.textContent = cleanName;
                
                if (!isMuted) startVisuals();
                fadeInAudio();
            }).catch((err) => {
                console.log(err);
                trackNameEl.textContent = "playback ready";
                stopVisuals();
            });
        }
    }

    function fadeInAudio() {
        let vol = 0;
        audioInstance.volume = vol;
        const fadeInt = setInterval(() => {
            if (vol < 0.3) {
                vol += 0.02;
                audioInstance.volume = Math.min(vol, 0.3);
            } else {
                clearInterval(fadeInt);
            }
        }, 150);
    }

    function handleTrackChange(dir) {
        if (tracks.length === 0) return;
        currentTrackIndex = (currentTrackIndex + dir + tracks.length) % tracks.length;
        playTrack();
    }

    function toggleMute() {
        if (!audioInstance) return;
        isMuted = !isMuted;
        audioInstance.muted = isMuted;
        
        if (isMuted) {
            stopVisuals();
            volIcon.setAttribute("data-lucide", "volume-x");
        } else {
            startVisuals();
            volIcon.setAttribute("data-lucide", "volume-2");
        }
        lucide.createIcons();
    }

    function startVisuals() {
        visualizer.classList.remove("inactive");
        spinDisc.classList.add("active");
        if (analyser) {
            bassVisualsActive = true;
            renderBass();
        }
    }

    function stopVisuals() {
        visualizer.classList.add("inactive");
        spinDisc.classList.remove("active");
        bassVisualsActive = false;
        if (animationFrameId) cancelAnimationFrame(animationFrameId);

        document.body.classList.remove("bass-flash-bg");
        const pfp = document.querySelector(".pfp-container");
        if(pfp) {
            pfp.style.boxShadow = "0 0 20px var(--accent-glow)";
            pfp.style.transform = "scale(1)";
        }
    }

    nextBtn.addEventListener("click", () => handleTrackChange(1));
    prevBtn.addEventListener("click", () => handleTrackChange(-1));
    muteBtn.addEventListener("click", toggleMute);

    function initVideoBg() {
        const bgImg = document.getElementById("bg-img");
        if (window.siteFiles && window.siteFiles.backgrounds && window.siteFiles.backgrounds.length > 0) {
            const rBg = window.siteFiles.backgrounds[Math.floor(Math.random() * window.siteFiles.backgrounds.length)];
            const bgPath = "backgrounds/" + rBg;
            
            if (rBg.endsWith('.mp4')) {
                bgImg.style.display = "none";
                bgVideo.style.display = "block";
                bgVideo.src = bgPath;
                bgVideo.volume = 0;
                let p = bgVideo.play();
                if (p !== undefined) {
                    p.then(() => {
                        bgVideo.classList.add("active");
                    }).catch(() => {});
                }
            } else if (rBg.endsWith('.gif')) {
                bgVideo.style.display = "none";
                bgImg.style.display = "block";
                bgImg.src = bgPath;
                // Minor trick to make sure browser pulls from cache correctly as active
                bgImg.onload = () => bgImg.classList.add("active");
            }
        }
    }

    function handleEntry() {
        overlay.classList.add("hidden");
        setTimeout(() => overlay.style.display = "none", 1000);
        mainPanel.classList.add("show");
        const discordPanel = document.getElementById("discord-panel");
        if(discordPanel) discordPanel.classList.add("show");
        const charContainer = document.getElementById("character-container");
        if(charContainer) charContainer.classList.add("show");
        
        initAudioContext();
        if(audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
        
        playTrack();
        initVideoBg();
        renderTypewriter();
        
        document.removeEventListener("click", handleEntry);
    }

    document.addEventListener("click", handleEntry);

    async function updateDiscordStatus() {
        try {
            const res = await fetch("https://api.lanyard.rest/v1/users/541388135712423936");
            const payload = await res.json();
            if (!payload || !payload.data) return;
            const data = payload.data;

            const avatarId = data.discord_user.avatar;
            const userId = data.discord_user.id;
            const avatarUrl = `https://cdn.discordapp.com/avatars/${userId}/${avatarId}.webp?size=256`;
            document.getElementById("dc-avatar").src = avatarUrl;
            document.getElementById("dc-status").className = `status-dot status-${data.discord_status}`;

            document.getElementById("dc-display-name").textContent = data.discord_user.display_name || data.discord_user.username;
            document.getElementById("dc-username").textContent = "@" + data.discord_user.username;

            const actContainer = document.getElementById("dc-activity");
            const playAct = data.activities && data.activities.find(a => a.type !== 4 && a.type !== 2);

            if (playAct) {
                actContainer.style.display = "block";
                let labelStr = "Playing a game";
                if (playAct.type === 3) labelStr = "Watching";

                document.getElementById("dc-activity-label").textContent = labelStr;
                document.getElementById("dc-activity-name").textContent = playAct.name;
                document.getElementById("dc-activity-details").textContent = playAct.details || "";
                document.getElementById("dc-activity-state").textContent = playAct.state || "";

                let imgSrc = `https://ui-avatars.com/api/?name=${encodeURIComponent(playAct.name)}&background=0d0d0d&color=fff`;
                if (playAct.assets && playAct.assets.large_image) {
                    let lImage = playAct.assets.large_image;
                    if (lImage.startsWith("mp:external/")) {
                        imgSrc = "https://media.discordapp.net/external/" + lImage.replace("mp:external/", "");
                    } else {
                        imgSrc = `https://cdn.discordapp.com/app-assets/${playAct.application_id}/${lImage}.webp`;
                    }
                }
                document.getElementById("dc-activity-img").src = imgSrc;
            } else {
                actContainer.style.display = "none";
            }

            const spotifyContainer = document.getElementById("dc-spotify");
            if (data.listening_to_spotify && data.spotify) {
                spotifyContainer.style.display = "block";
                document.getElementById("dc-spotify-img").src = data.spotify.album_art_url;
                document.getElementById("dc-spotify-song").textContent = data.spotify.song;
                document.getElementById("dc-spotify-artist").textContent = data.spotify.artist;
            } else {
                spotifyContainer.style.display = "none";
            }

        } catch (err) {
            console.warn("Failed fetching Lanyard API");
        }
    }
    
    updateDiscordStatus();
    setInterval(updateDiscordStatus, 5000);

});

// ---- Roblox overlay: in-page stats + tools at /roblox, no navigation so audio never stops ----
document.addEventListener("DOMContentLoaded", () => {
    const overlay = document.getElementById("tracking-overlay");
    const link = document.getElementById("tracking-link");
    const closeBtn = document.getElementById("tracking-close");
    if (!overlay || !link || !closeBtn) return;

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

    // ---- DevEx calculator: Robux <-> cash, USD rates converted via ECB FX (frankfurter) ----
    const DEVEX_RATES = {
        standard: { usd: 0.0038, label: "Standard" },
        legacy: { usd: 0.0035, label: "Legacy (earned before 5 Sep 2025)" },
        us18: { usd: 0.0054, label: "US 18+" }
    };
    const DEVEX_MIN = 30000;
    // fallback until live rates load (approx. USD -> currency)
    const fx = {
        USD: 1, GBP: 0.754, EUR: 0.881, CAD: 1.417, AUD: 1.432, BRL: 5.4, JPY: 148, MXN: 18.5,
        INR: 88, PHP: 57, IDR: 16400, TRY: 41, PLN: 3.7, SEK: 9.5, NOK: 10.1, DKK: 6.4,
        CHF: 0.8, NZD: 1.7, SGD: 1.29, HKD: 7.8, KRW: 1390, ZAR: 17.5, MYR: 4.2, THB: 32.5
    };
    const FX_URL = "https://api.frankfurter.dev/v2/rates?base=USD&quotes=" + Object.keys(fx).filter(c => c !== "USD").join(",");
    // Wise balance-to-balance conversion fee from USD (% of amount, no flat fee), from wise.com pricing
    const WISE_FEE_PCT = { USD: 0, GBP: 0.33, EUR: 0.29, CAD: 0.28, AUD: 0.28 };
    let fxDate = null;
    let fxPromise = null;
    let devexRate = "standard";
    let devexLastEdited = "robux";

    const robuxIn = document.getElementById("t-devexRobux");
    const cashIn = document.getElementById("t-devexCash");
    const currencySel = document.getElementById("t-devexCurrency");
    const wiseIn = document.getElementById("t-devexWise");
    const shareWrap = document.getElementById("t-devexShareWrap");
    const shareIn = document.getElementById("t-devexShare");
    try { const saved = localStorage.getItem("devex18Share"); if (saved != null) shareIn.value = saved; } catch (e) {}
    const money = (n, cur) => new Intl.NumberFormat("en-GB", { style: "currency", currency: cur, currencyDisplay: "narrowSymbol" }).format(n);

    function loadFx() {
        if (fxPromise) return fxPromise;
        fxPromise = fetch(FX_URL)
            .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
            .then(rows => rows.forEach(row => { fx[row.quote] = row.rate; fxDate = row.date; }))
            .catch(err => console.error("fx load failed", err))
            .finally(() => { updateDevex(); updateBlackMarket(); });
        return fxPromise;
    }

    // % of Robux earned at the US 18+ rate; the rest cashes out at the standard rate
    function us18Share() {
        return Math.min(100, Math.max(0, Number(shareIn.value) || 0));
    }

    function devexUsdPerRobux() {
        if (devexRate !== "us18") return DEVEX_RATES[devexRate].usd;
        const p = us18Share() / 100;
        return DEVEX_RATES.us18.usd * p + DEVEX_RATES.standard.usd * (1 - p);
    }

    function updateDevex() {
        const usdPerRobux = devexUsdPerRobux();
        const cur = currencySel.value;
        const feePct = wiseIn.checked ? WISE_FEE_PCT[cur] : 0;
        // effective local currency per USD after the Wise conversion fee
        const rate = fx[cur] * (1 - feePct / 100);

        if (devexLastEdited === "robux") {
            const robux = Math.max(0, Math.floor(Number(robuxIn.value) || 0));
            cashIn.value = robux ? (robux * usdPerRobux * rate).toFixed(2) : "";
        } else {
            const cash = Math.max(0, Number(cashIn.value) || 0);
            robuxIn.value = cash ? Math.ceil(cash / rate / usdPerRobux) : "";
        }

        const robux = Math.max(0, Math.floor(Number(robuxIn.value) || 0));
        const usd = robux * usdPerRobux;
        const tiles = [
            { label: "Payout", value: money(usd * rate, cur) },
            { label: "In USD", value: money(usd, "USD") }
        ];
        if (feePct) tiles.push({ label: "Wise Fee (" + feePct + "%)", value: money(usd * fx[cur] * feePct / 100, cur) });
        document.getElementById("t-devexResult").innerHTML = tiles.map(t => `<div class="devex-tile">
            <div class="label">${t.label}</div>
            <div class="value">${t.value}</div>
        </div>`).join("");

        const note = document.getElementById("t-devexNote");
        const fxText = cur === "USD" ? "" : " · 1 USD = " + fx[cur].toFixed(4) + " " + cur + (fxDate ? " (ECB, " + fxDate + ")" : " (approx.)")
            + (feePct ? " minus " + feePct + "% Wise fee" : "");
        const warn = robux > 0 && robux < DEVEX_MIN
            ? `<span class="warn">below the ${DEVEX_MIN.toLocaleString("en-GB")} Robux minimum to cash out</span> · `
            : "";
        const rateText = devexRate === "us18" && us18Share() < 100
            ? us18Share() + "% at US 18+ $" + DEVEX_RATES.us18.usd + ", rest at standard $" + DEVEX_RATES.standard.usd + " = $" + +usdPerRobux.toFixed(6) + "/Robux"
            : DEVEX_RATES[devexRate].label + " rate $" + usdPerRobux + "/Robux";
        note.innerHTML = warn + rateText + fxText + " · before any tax";
    }

    robuxIn.addEventListener("input", () => { devexLastEdited = "robux"; updateDevex(); });
    cashIn.addEventListener("input", () => { devexLastEdited = "cash"; updateDevex(); });
    currencySel.addEventListener("change", updateDevex);
    wiseIn.addEventListener("change", updateDevex);
    shareIn.addEventListener("input", () => {
        try { localStorage.setItem("devex18Share", shareIn.value); } catch (e) {}
        updateDevex();
    });
    document.querySelectorAll("#t-devexRates .range-pill").forEach(btn => {
        btn.addEventListener("click", () => {
            devexRate = btn.dataset.rate;
            shareWrap.hidden = devexRate !== "us18";
            document.querySelectorAll("#t-devexRates .range-pill").forEach(b => b.classList.toggle("active", b === btn));
            updateDevex();
        });
    });
    updateDevex();

    // ---- Marketplace tax: sellers keep 70% of the price, rounded down ----
    const TAX_KEEP = 0.7;
    const taxPriceIn = document.getElementById("t-taxPrice");
    const taxNetIn = document.getElementById("t-taxNet");
    let taxLastEdited = "price";
    const rbx = n => Math.round(n).toLocaleString("en-GB") + " R$";
    const netOf = price => Math.floor(price * TAX_KEEP);
    const priceFor = net => {
        let p = Math.ceil(net / TAX_KEEP);
        while (p > 0 && netOf(p - 1) >= net) p--;
        while (netOf(p) < net) p++;
        return p;
    };

    function updateTax() {
        if (taxLastEdited === "price") {
            const price = Math.max(0, Math.floor(Number(taxPriceIn.value) || 0));
            taxNetIn.value = price ? netOf(price) : "";
        } else {
            const net = Math.max(0, Math.floor(Number(taxNetIn.value) || 0));
            taxPriceIn.value = net ? priceFor(net) : "";
        }
        const price = Math.max(0, Math.floor(Number(taxPriceIn.value) || 0));
        const net = netOf(price);
        document.getElementById("t-taxResult").innerHTML = [
            { label: "You Receive", value: rbx(net) },
            { label: "Roblox Takes", value: rbx(price - net) },
            { label: "Buyer Pays", value: rbx(price) }
        ].map(t => `<div class="devex-tile"><div class="label">${t.label}</div><div class="value">${t.value}</div></div>`).join("");
        document.getElementById("t-taxTable").innerHTML = '<div class="tax-row head"><span>To receive</span><span>Set price to</span></div>'
            + [100, 500, 1000, 2500, 5000, 10000, 25000, 100000].map(n => `<button class="tax-row" data-net="${n}"><span>${rbx(n)}</span><span>${rbx(priceFor(n))}</span></button>`).join("");
        document.getElementById("t-taxNote").textContent = "30% marketplace fee on game passes, dev products and items · earnings are rounded down · pending for a few days before they land";
    }
    taxPriceIn.addEventListener("input", () => { taxLastEdited = "price"; updateTax(); });
    taxNetIn.addEventListener("input", () => { taxLastEdited = "net"; updateTax(); });
    document.getElementById("t-taxTable").addEventListener("click", e => {
        const row = e.target.closest("[data-net]");
        if (!row) return;
        taxNetIn.value = row.dataset.net;
        taxLastEdited = "net";
        updateTax();
    });
    updateTax();

    // ---- Black market check: what a Robux deal is worth vs cashing out through DevEx ----
    const bmRobuxIn = document.getElementById("t-bmRobux");
    const bmPriceIn = document.getElementById("t-bmPrice");
    const bmCurrencySel = document.getElementById("t-bmCurrency");
    bmCurrencySel.innerHTML = Object.keys(fx).map(c => `<option value="${c}">${c}</option>`).join("");
    let bmPrices = {};
    try { bmPrices = JSON.parse(localStorage.getItem("bmPrices") || "{}") || {}; } catch (e) {}
    try { bmCurrencySel.value = localStorage.getItem("bmCurrency") || "GBP"; } catch (e) { bmCurrencySel.value = "GBP"; }
    if (!bmCurrencySel.value) bmCurrencySel.value = "GBP";
    bmPriceIn.value = bmPrices[bmCurrencySel.value] != null ? bmPrices[bmCurrencySel.value] : "";

    function updateBlackMarket() {
        const cur = bmCurrencySel.value;
        const robux = Math.max(0, Math.floor(Number(bmRobuxIn.value) || 0));
        const price = Math.max(0, Number(bmPriceIn.value) || 0);
        const devexValue = robux * DEVEX_RATES.standard.usd * fx[cur];
        const tiles = [];
        if (robux && price) {
            tiles.push({ label: "Per 1K Robux", value: money(price / robux * 1000, cur) });
            tiles.push({ label: "DevEx Value", value: money(devexValue, cur) });
            tiles.push({ label: "vs DevEx", value: (price / devexValue).toFixed(2) + "×" });
            tiles.push({ label: "In USD", value: money(price / fx[cur], "USD") });
        } else {
            tiles.push({ label: "DevEx Value", value: money(devexValue, cur) });
            tiles.push({ label: "Per 1K at DevEx", value: money(DEVEX_RATES.standard.usd * 1000 * fx[cur], cur) });
        }
        document.getElementById("t-bmResult").innerHTML = tiles.map(t => `<div class="devex-tile"><div class="label">${t.label}</div><div class="value">${t.value}</div></div>`).join("");
        const verdict = robux && price
            ? (price >= devexValue ? '<span class="warn">paying more than the DevEx value</span> · ' : "below the DevEx value · ")
            : "enter what you paid to compare · ";
        document.getElementById("t-bmNote").innerHTML = verdict + "standard DevEx $" + DEVEX_RATES.standard.usd + "/Robux"
            + (cur === "USD" ? "" : " · 1 USD = " + fx[cur].toFixed(4) + " " + cur + (fxDate ? " (ECB, " + fxDate + ")" : " (approx.)"))
            + " · buying off-platform breaks the Roblox ToS and can get the account terminated";
    }
    bmRobuxIn.addEventListener("input", updateBlackMarket);
    bmPriceIn.addEventListener("input", () => {
        bmPrices[bmCurrencySel.value] = bmPriceIn.value;
        try { localStorage.setItem("bmPrices", JSON.stringify(bmPrices)); } catch (e) {}
        updateBlackMarket();
    });
    bmCurrencySel.addEventListener("change", () => {
        try { localStorage.setItem("bmCurrency", bmCurrencySel.value); } catch (e) {}
        bmPriceIn.value = bmPrices[bmCurrencySel.value] != null ? bmPrices[bmCurrencySel.value] : "";
        updateBlackMarket();
    });
    updateBlackMarket();

    // ---- Tabs: stats + tools, current tab kept in the URL hash ----
    const TABS = ["stats", "icon", "mosaic", "calc", "frontpage", "crop"];
    let activeTab = "stats";

    function setTab(tab, replace) {
        if (!TABS.includes(tab)) tab = "stats";
        activeTab = tab;
        overlay.querySelectorAll(".rbx-tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
        overlay.querySelectorAll(".rbx-pane").forEach(p => p.classList.toggle("active", p.dataset.pane === tab));
        if (replace !== false && overlay.classList.contains("show")) {
            history.replaceState({ tracking: true }, "", "/roblox/" + (tab === "stats" ? "" : "#" + tab));
        }
        document.dispatchEvent(new CustomEvent("roblox:tab", { detail: tab }));
    }
    window.robloxTabs = { set: setTab, get active() { return overlay.classList.contains("show") ? activeTab : null; } };

    overlay.querySelectorAll(".rbx-tab").forEach(btn => btn.addEventListener("click", () => setTab(btn.dataset.tab)));

    function openTracking(pushState) {
        overlay.classList.add("show");
        loadFx();
        document.body.style.overflow = "hidden";
        const hashTab = location.hash.slice(1);
        if (pushState !== false) history.pushState({ tracking: true }, "", "/roblox/" + (activeTab === "stats" ? "" : "#" + activeTab));
        else if (TABS.includes(hashTab)) setTab(hashTab, false);
        document.dispatchEvent(new CustomEvent("roblox:tab", { detail: activeTab }));
        loadChartLib().then(initTrackingView).catch(() => {
            document.getElementById("t-statsGrid").innerHTML = '<div class="empty">failed to load charts</div>';
        });
    }

    function closeTracking(pushState) {
        overlay.classList.remove("show");
        document.body.style.overflow = "";
        if (pushState !== false) history.pushState({}, "", "/");
        if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
    }

    link.addEventListener("click", (e) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        openTracking();
    });

    closeBtn.addEventListener("click", () => closeTracking());

    overlay.addEventListener("click", (e) => {
        if (e.target === overlay) closeTracking();
    });

    document.addEventListener("keydown", (e) => {
        if (!overlay.classList.contains("show") || e.defaultPrevented) return;
        if (e.key === "Escape") { closeTracking(); return; }
        const t = e.target;
        const typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
        if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey && /^[1-6]$/.test(e.key)) setTab(TABS[Number(e.key) - 1]);
    });

    window.addEventListener("popstate", () => {
        if (location.pathname.startsWith("/roblox")) {
            openTracking(false);
        } else {
            closeTracking(false);
        }
    });

    if (location.pathname.startsWith("/roblox")) openTracking(false);
});
