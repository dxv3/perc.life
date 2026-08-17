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

// ---- Tracking overlay: in-page view of /tracking, no navigation so audio never stops ----
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
        { label: "Like Ratio", key: "__ratio", accent: "#fcfcfc" }
    ];
    const chartDefs = [
        { title: "Live Players", key: "playing", color: "#a0c4ff" },
        { title: "Visits", key: "visits", color: "#c4b5fd" },
        { title: "Favorites", key: "favorites", color: "#f5a3c7" }
    ];

    const fmt = n => n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : n;
    const deltaFmt = (cur, prev) => {
        if (prev === 0) return { text: "N/A", cls: "flat" };
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
            s.src = "https://unpkg.com/chart.js@4.4.0/dist/chart.umd.min.js";
            s.onload = resolve;
            s.onerror = reject;
            document.head.appendChild(s);
        });
        return chartLibPromise;
    }

    function setActiveRangeKey(key) {
        overlay.querySelectorAll(".range-pill").forEach(b => b.classList.toggle("active", b.dataset.key === key));
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
        rangeLabel.textContent = filtered.length + " snapshots shown · " + allData.length + " total · every 5 min";
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

    function openTracking(pushState) {
        overlay.classList.add("show");
        document.body.style.overflow = "hidden";
        if (pushState !== false) history.pushState({ tracking: true }, "", "/tracking/");
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
        if (e.key === "Escape" && overlay.classList.contains("show")) closeTracking();
    });

    window.addEventListener("popstate", () => {
        if (location.pathname.startsWith("/tracking")) {
            openTracking(false);
        } else {
            closeTracking(false);
        }
    });
});
