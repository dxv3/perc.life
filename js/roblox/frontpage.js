(() => {
    "use strict";
    const {
        $, $$, clamp, esc, store, idb,
        loadImage, assetFromBlob, canvasToBlob, pickFiles, makeCanvas, drawCover,
        roundRectPath, squareOf, downloadBlob, copyBlob, sessionName, toast,
        fail, dropTarget, tools
    } = window.Rbx;

    // =====================================================================
    // Frontpage: preview a thumbnail / icon on a Roblox-style front page
    // =====================================================================
    (() => {
        const root = document.getElementById("rbx-frontpage");
        if (!root) return;

        const FEED_URL = "data/roblox-feed.json";
        const SIZES = { desktop: [1920, 1080], mobile: [430, 932] };
        const THEMES = {
            dark: { bg: "#111216", bar: "#111216", line: "#2a2b31", surface: "#25262c", text: "#f7f7f8", muted: "#a7a8ad", hover: "#ffffff" },
            light: { bg: "#f7f7f8", bar: "#ffffff", line: "#dedfe3", surface: "#e2e3e7", text: "#121215", muted: "#606166", hover: "#121215" }
        };
        const THUMB_UP = new Path2D("M7 10v12M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z");
        const USERS = new Path2D("M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M13 7a4 4 0 1 1-8 0a4 4 0 1 1 8 0M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75");
        const SEARCH = new Path2D("M19 11a8 8 0 1 1-16 0a8 8 0 1 1 16 0M21 21l-4.3-4.3");
        const PLACEHOLDER_NAMES = ["Obby Tower", "Pet Simulator", "Tycoon Empire", "Escape the Lab", "Racing Legends", "Survive the Night",
            "Cafe Roleplay", "Sword Fighting", "Brainrot Clicker", "Island Life", "Hide and Seek", "Blox Battles", "Fishing Sim",
            "Parkour Run", "Zombie Defense", "Find the Items", "Mining Sim", "Speed Run", "City Life", "Tower Defense"];

        let st = Object.assign({
            page: "home", device: "desktop", theme: "dark", sidebar: true, density: "cozy", view: "fit",
            name: "My Game", creator: "dxv3", rating: 92, playing: 1200, genre: "all", seed: 1, active: 0, spread: false,
            slots: { home: { s: 1, i: 1 }, search: { s: 0, i: 0 }, charts: { s: 0, i: 1 } }
        }, store.get("rbxFront", {}));
        let variants = []; // assets
        let icon = null; // asset
        let iconAuto = new Map(); // variant id -> square canvas
        const tests = { distance: false, squint: false, gray: false };
        let feed = null;
        let feedError = false;
        let lastTiles = [];
        let hover = null;

        const saveState = () => store.set("rbxFront", st);
        function persistImages() {
            idb.set("frontpage", { variants: variants.map(v => v.blob), icon: icon ? icon.blob : null });
        }

        // ---- remote images (roblox cdn), loaded with CORS so exports keep working ----
        const imgCache = new Map();
        function remote(url) {
            if (!url) return null;
            let entry = imgCache.get(url);
            if (!entry) {
                entry = { img: null };
                imgCache.set(url, entry);
                loadImage(url, true)
                    .catch(() => loadImage(url))
                    .then(img => { entry.img = img; schedule(); })
                    .catch(() => {});
            }
            return entry.img;
        }

        function seeded(seed) {
            let a = seed >>> 0;
            return () => {
                a = (a + 0x6D2B79F5) >>> 0;
                let t = a;
                t = Math.imul(t ^ (t >>> 15), t | 1);
                t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
                return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
            };
        }
        function shuffled(list, seed) {
            const rnd = seeded(seed);
            const out = list.slice();
            for (let i = out.length - 1; i > 0; i--) {
                const j = Math.floor(rnd() * (i + 1));
                [out[i], out[j]] = [out[j], out[i]];
            }
            return out;
        }

        const placeholders = PLACEHOLDER_NAMES.concat(PLACEHOLDER_NAMES).map((name, i) => ({
            id: "p" + i, name, creator: "creator", rating: 70 + (i * 7) % 28, playing: Math.round(400 * Math.pow(1.6, i % 14)), genre: "other", hue: (i * 47) % 360
        }));

        function allGames() {
            return feed ? Object.values(feed.games) : placeholders;
        }
        function byGenre(list) {
            if (st.genre === "all") return list;
            const f = list.filter(g => g.genre === st.genre);
            return f.length >= 6 ? f : list;
        }

        function mine(k) {
            const v = variants[k];
            const thumb = v ? v.img : null;
            let ic = icon ? icon.img : null;
            if (!ic && v) {
                if (!iconAuto.has(v.id)) iconAuto.set(v.id, squareOf(v, Math.min(512, Math.min(v.w, v.h))));
                ic = iconAuto.get(v.id);
            }
            return { mine: true, variant: k, name: st.name || "My Game", creator: st.creator, rating: st.rating, playing: st.playing, thumbImg: thumb, iconImg: ic, hue: 210 };
        }

        // ---- layout: sections of tiles in page coordinates ----
        function layout(W, H) {
            const mobile = st.device === "mobile";
            const compact = st.density === "compact";
            const sections = [];
            const top = mobile ? 56 : 64;
            const left = mobile ? 16 : (st.sidebar ? 232 : 0) + 48;
            const right = mobile ? 16 : 48;
            const CW = W - left - right;
            const gap = mobile ? 10 : compact ? 12 : 18;
            const titleH = mobile ? 34 : 46;
            const textH = mobile ? 40 : 54;
            const bottom = mobile ? H - 60 : H;
            const thumbCols = mobile ? (compact ? 3 : 2) : compact ? 6 : 4;
            const iconCols = mobile ? (compact ? 5 : 4) : compact ? 10 : 8;
            let y = top + (mobile ? 12 : 24);

            const grid = (title, kind, cols, maxRows, partialCols) => {
                const visible = partialCols || cols;
                const w = (CW - gap * (Math.ceil(visible) - 1)) / visible;
                const h = kind === "thumb" ? w * 9 / 16 : w;
                const sec = { title, kind, titleY: y, tiles: [] };
                y += titleH;
                for (let r = 0; r < maxRows && y < bottom; r++) {
                    const n = partialCols ? Math.ceil(partialCols) : cols;
                    for (let c = 0; c < n; c++) sec.tiles.push({ x: left + c * (w + gap), y, w, h });
                    y += h + textH + gap;
                }
                y += mobile ? 6 : 14;
                sections.push(sec);
            };

            if (st.page === "home") {
                grid("Continue", "icon", iconCols, 1);
                grid("Recommended For You", "thumb", thumbCols, 6);
            } else if (st.page === "search") {
                grid(`Results for "${st.name || "My Game"}"`, "icon", mobile ? (compact ? 4 : 3) : iconCols, 12);
            } else {
                const sorts = feed ? feed.sorts : [{ name: "Top Trending" }, { name: "Up-and-Coming" }, { name: "Top Playing Now" }, { name: "Fun with Friends" }, { name: "Top Rated" }];
                const peek = mobile ? (compact ? 2.3 : 1.6) : thumbCols + 0.4;
                for (const s of sorts) {
                    if (y >= bottom) break;
                    grid(s.name, "thumb", thumbCols, 1, peek);
                    sections[sections.length - 1].sortId = s.id;
                }
            }
            return { sections, left, top, CW, mobile };
        }

        // ---- fill sections with games, inserting the user's game at the chosen slot(s) ----
        function fill(lay) {
            const slot = st.slots[st.page] || { s: 0, i: 0 };
            const secCount = lay.sections.length;
            if (!secCount) return;
            const placed = new Map(); // "s:i" -> mine(k)
            const s0 = clamp(slot.s, 0, secCount - 1);
            if (variants.length) {
                if (st.spread && variants.length > 1) {
                    variants.forEach((_, k) => {
                        const s = (s0 + k) % secCount;
                        const sec = lay.sections[s];
                        let i = clamp(slot.i, 0, sec.tiles.length - 1);
                        while (placed.has(s + ":" + i) && i < sec.tiles.length - 1) i++;
                        placed.set(s + ":" + i, mine(k));
                    });
                } else {
                    placed.set(s0 + ":" + clamp(slot.i, 0, lay.sections[s0].tiles.length - 1), mine(st.active));
                }
            } else if (icon) {
                placed.set(s0 + ":" + clamp(slot.i, 0, lay.sections[s0].tiles.length - 1), mine(0));
            }

            const pool = shuffled(byGenre(allGames()), st.seed);
            let p = 0;
            lay.sections.forEach((sec, s) => {
                let list = pool;
                let q = null;
                if (st.page === "charts" && feed && sec.sortId) {
                    const sort = feed.sorts.find(x => x.id === sec.sortId);
                    list = byGenre(sort.gameIds.map(id => feed.games[id]).filter(Boolean));
                    q = 0;
                }
                sec.tiles.forEach((t, i) => {
                    t.s = s;
                    t.i = i;
                    if (placed.has(s + ":" + i)) { t.game = placed.get(s + ":" + i); return; }
                    if (q != null) { t.game = list[q++ % list.length]; return; }
                    t.game = pool[p++ % pool.length];
                });
            });
        }

        const fmtNum = n => n >= 1e9 ? (n / 1e9).toFixed(1).replace(/\.0$/, "") + "B" : n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M" : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K" : String(n);

        function fitText(ctx, text, maxW) {
            if (ctx.measureText(text).width <= maxW) return text;
            let lo = 0, hi = text.length;
            while (lo < hi) {
                const mid = (lo + hi + 1) >> 1;
                if (ctx.measureText(text.slice(0, mid) + "…").width <= maxW) lo = mid; else hi = mid - 1;
            }
            return text.slice(0, lo) + "…";
        }

        function glyph(ctx, path, x, y, size, color) {
            ctx.save();
            ctx.translate(x, y);
            ctx.scale(size / 24, size / 24);
            ctx.strokeStyle = color;
            ctx.lineWidth = 2.2;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.stroke(path);
            ctx.restore();
        }

        function drawTile(ctx, t, T, kind, mobile) {
            const g = t.game;
            if (!g) return;
            const r = kind === "thumb" ? (mobile ? 8 : 10) : (mobile ? 10 : 14);
            ctx.save();
            roundRectPath(ctx, t.x, t.y, t.w, t.h, r);
            ctx.clip();
            const img = g.mine ? (kind === "thumb" ? g.thumbImg : g.iconImg) : remote(kind === "thumb" ? g.thumb : g.icon);
            if (img) {
                drawCover(ctx, img, t.x, t.y, t.w, t.h);
            } else {
                const grad = ctx.createLinearGradient(t.x, t.y, t.x + t.w, t.y + t.h);
                const hue = g.hue != null ? g.hue : 220;
                grad.addColorStop(0, `hsl(${hue} 30% ${T === THEMES.dark ? 22 : 80}%)`);
                grad.addColorStop(1, `hsl(${(hue + 40) % 360} 30% ${T === THEMES.dark ? 16 : 72}%)`);
                ctx.fillStyle = g.mine || g.hue != null ? grad : T.surface;
                ctx.fillRect(t.x, t.y, t.w, t.h);
            }
            ctx.restore();

            const nameSize = mobile ? 13 : 17;
            const metaSize = mobile ? 11 : 14;
            ctx.textBaseline = "top";
            ctx.textAlign = "left";
            ctx.fillStyle = T.text;
            ctx.font = `600 ${nameSize}px Outfit, system-ui, sans-serif`;
            ctx.fillText(fitText(ctx, g.name, t.w), t.x, t.y + t.h + (mobile ? 6 : 9));
            const my = t.y + t.h + (mobile ? 6 : 9) + nameSize + (mobile ? 5 : 7);
            ctx.font = `500 ${metaSize}px Outfit, system-ui, sans-serif`;
            ctx.fillStyle = T.muted;
            glyph(ctx, THUMB_UP, t.x, my - 1, metaSize, T.muted);
            const rating = g.rating + "%";
            let x = t.x + metaSize + 5;
            ctx.fillText(rating, x, my);
            x += ctx.measureText(rating).width + (mobile ? 10 : 14);
            if (x + metaSize + 30 < t.x + t.w) {
                glyph(ctx, USERS, x, my - 1, metaSize, T.muted);
                ctx.fillText(fmtNum(g.playing || 0), x + metaSize + 5, my);
            }
        }

        function drawChrome(ctx, W, H, T, lay) {
            const mobile = lay.mobile;
            ctx.fillStyle = T.bar;
            ctx.fillRect(0, 0, W, lay.top);
            ctx.fillStyle = T.line;
            ctx.fillRect(0, lay.top - 1, W, 1);

            // logo: a tilted rounded square
            const lx = mobile ? 30 : 40, ly = lay.top / 2, ls = mobile ? 22 : 26;
            ctx.save();
            ctx.translate(lx, ly);
            ctx.rotate(-0.26);
            roundRectPath(ctx, -ls / 2, -ls / 2, ls, ls, 4);
            ctx.fillStyle = T.text;
            ctx.fill();
            ctx.fillStyle = T.bar;
            ctx.fillRect(-ls * 0.14, -ls * 0.14, ls * 0.28, ls * 0.28);
            ctx.restore();

            ctx.textBaseline = "middle";
            if (!mobile) {
                ctx.font = "600 17px Outfit, system-ui, sans-serif";
                ctx.fillStyle = T.text;
                let nx = 84;
                ["Charts", "Marketplace", "Create", "Robux"].forEach(n => {
                    ctx.globalAlpha = st.page === "charts" && n === "Charts" ? 1 : 0.85;
                    ctx.fillText(n, nx, ly);
                    nx += ctx.measureText(n).width + 34;
                });
                ctx.globalAlpha = 1;
                const sx = nx + 20, sw = Math.min(620, W - sx - 260);
                roundRectPath(ctx, sx, ly - 19, sw, 38, 8);
                ctx.fillStyle = T.surface;
                ctx.fill();
                glyph(ctx, SEARCH, sx + 12, ly - 9, 18, T.muted);
                ctx.font = "400 16px Outfit, system-ui, sans-serif";
                ctx.fillStyle = st.page === "search" ? T.text : T.muted;
                ctx.fillText(st.page === "search" ? (st.name || "My Game") : "Search", sx + 42, ly + 1);
                for (let i = 0; i < 4; i++) {
                    ctx.beginPath();
                    ctx.arc(W - 40 - i * 46, ly, 15, 0, Math.PI * 2);
                    ctx.fillStyle = i === 0 ? T.text : T.surface;
                    ctx.globalAlpha = i === 0 ? 0.9 : 1;
                    ctx.fill();
                    ctx.globalAlpha = 1;
                }
            } else {
                glyph(ctx, SEARCH, W - 74, ly - 10, 20, T.text);
                ctx.beginPath();
                ctx.arc(W - 28, ly, 13, 0, Math.PI * 2);
                ctx.fillStyle = T.surface;
                ctx.fill();
                ctx.fillStyle = T.bar;
                ctx.fillRect(0, H - 60, W, 60);
                ctx.fillStyle = T.line;
                ctx.fillRect(0, H - 60, W, 1);
                for (let i = 0; i < 5; i++) {
                    ctx.beginPath();
                    ctx.arc(W / 10 + i * W / 5, H - 30, 11, 0, Math.PI * 2);
                    ctx.fillStyle = i === (st.page === "charts" ? 1 : st.page === "search" ? 2 : 0) ? T.text : T.muted;
                    ctx.globalAlpha = 0.85;
                    ctx.fill();
                    ctx.globalAlpha = 1;
                }
            }

            if (!mobile && st.sidebar) {
                ctx.fillStyle = T.bar;
                ctx.fillRect(0, lay.top, 232, H - lay.top);
                ctx.fillStyle = T.line;
                ctx.fillRect(232, lay.top, 1, H - lay.top);
                ctx.beginPath();
                ctx.arc(44, lay.top + 40, 16, 0, Math.PI * 2);
                ctx.fillStyle = T.surface;
                ctx.fill();
                ctx.font = "600 16px Outfit, system-ui, sans-serif";
                ctx.fillStyle = T.text;
                ctx.fillText(st.creator || "you", 72, lay.top + 41);
                const items = ["Home", "Profile", "Messages", "Connections", "Avatar", "Inventory", "Trade", "Groups", "Blog", "Store", "Gift Cards"];
                ctx.font = "500 16px Outfit, system-ui, sans-serif";
                items.forEach((n, i) => {
                    const iy = lay.top + 96 + i * 44;
                    if (n === "Home" && st.page === "home") {
                        roundRectPath(ctx, 14, iy - 18, 204, 36, 8);
                        ctx.fillStyle = T.surface;
                        ctx.fill();
                    }
                    ctx.fillStyle = T.muted;
                    roundRectPath(ctx, 30, iy - 8, 16, 16, 4);
                    ctx.fill();
                    ctx.fillStyle = T.text;
                    ctx.fillText(n, 60, iy + 1);
                });
            }
        }

        function paint(ctx, W, H) {
            const T = THEMES[st.theme];
            const lay = layout(W, H);
            fill(lay);
            ctx.fillStyle = T.bg;
            ctx.fillRect(0, 0, W, H);
            ctx.save();
            ctx.beginPath();
            ctx.rect(lay.left - 6, lay.top, W - lay.left + 6, H - lay.top);
            ctx.clip();
            const tiles = [];
            lay.sections.forEach(sec => {
                ctx.font = `700 ${lay.mobile ? 17 : 24}px Outfit, system-ui, sans-serif`;
                ctx.fillStyle = THEMES[st.theme].text;
                ctx.textBaseline = "top";
                ctx.textAlign = "left";
                ctx.fillText(sec.title, lay.left, sec.titleY);
                if (st.page === "charts" || sec.kind === "thumb") {
                    ctx.font = `600 ${lay.mobile ? 13 : 16}px Outfit, system-ui, sans-serif`;
                    ctx.fillStyle = T.muted;
                    ctx.textAlign = "right";
                    ctx.fillText("See All  ›", W - (lay.mobile ? 16 : 48), sec.titleY + (lay.mobile ? 3 : 6));
                    ctx.textAlign = "left";
                }
                sec.tiles.forEach(t => {
                    drawTile(ctx, t, T, sec.kind, lay.mobile);
                    tiles.push(Object.assign(t, { kind: sec.kind, mobile: lay.mobile }));
                });
            });
            ctx.restore();
            drawChrome(ctx, W, H, T, lay);
            return tiles;
        }

        // ---- UI ----
        root.innerHTML = `
            <div class="fp-layout">
                <div class="rbx-card rbx-controls fp-side">
                    <div class="rbx-card-title">Thumbnails <span class="rbx-hint">(a/b, up to 4)</span></div>
                    <div class="fp-variants" id="fp-variants"></div>
                    <div class="rbx-row">
                        <button class="rbx-btn" id="fp-addVariant">Add thumbnail</button>
                        <label class="rbx-check"><input type="checkbox" id="fp-spread"> Spread across page</label>
                    </div>
                    <div class="rbx-card-title">Icon</div>
                    <div class="fp-icon-row">
                        <div class="fp-icon" id="fp-icon"></div>
                        <div class="rbx-col">
                            <button class="rbx-btn" id="fp-iconUp">Upload icon</button>
                            <button class="rbx-btn" id="fp-iconCrop">Crop from thumbnail →</button>
                            <button class="rbx-btn ghost" id="fp-iconDel">Remove</button>
                        </div>
                    </div>
                    <div class="rbx-card-title">Game</div>
                    <input id="fp-name" class="rbx-input" placeholder="game name" spellcheck="false">
                    <input id="fp-creator" class="rbx-input" placeholder="creator" spellcheck="false">
                    <div class="rbx-row">
                        <label class="rbx-mini-field">Rating %<input id="fp-rating" type="number" min="0" max="100" class="rbx-input"></label>
                        <label class="rbx-mini-field">Playing<input id="fp-playing" type="number" min="0" class="rbx-input"></label>
                    </div>
                    <div class="rbx-card-title">Neighbours</div>
                    <div class="rbx-row">
                        <select id="fp-genre" class="rbx-input"><option value="all">all genres</option></select>
                        <button class="rbx-btn" id="fp-shuffle">Reshuffle</button>
                    </div>
                    <div class="rbx-hint" id="fp-feedInfo"></div>
                </div>
                <div class="rbx-card fp-main">
                    <div class="fp-bar">
                        <div class="range-controls" data-key="page">
                            <button class="range-pill" data-val="home">Home</button>
                            <button class="range-pill" data-val="search">Search</button>
                            <button class="range-pill" data-val="charts">Charts</button>
                        </div>
                        <div class="range-controls" data-key="device">
                            <button class="range-pill" data-val="desktop">Desktop</button>
                            <button class="range-pill" data-val="mobile">Mobile</button>
                        </div>
                        <div class="range-controls" data-key="theme">
                            <button class="range-pill" data-val="dark">Dark</button>
                            <button class="range-pill" data-val="light">Light</button>
                        </div>
                        <div class="range-controls" data-key="density">
                            <button class="range-pill" data-val="cozy">Cozy</button>
                            <button class="range-pill" data-val="compact">Compact</button>
                        </div>
                        <div class="range-controls" data-key="view">
                            <button class="range-pill" data-val="fit">Whole screen</button>
                            <button class="range-pill" data-val="full">100%</button>
                        </div>
                        <div class="range-controls">
                            <button class="range-pill" id="fp-sidebar">Sidebar</button>
                        </div>
                    </div>
                    <div class="fp-bar">
                        <span class="rbx-hint">tests</span>
                        <div class="range-controls" id="fp-tests">
                            <button class="range-pill" data-test="distance">Distance</button>
                            <button class="range-pill" data-test="squint">Squint</button>
                            <button class="range-pill" data-test="gray">Grayscale</button>
                        </div>
                        <span class="fp-spacer"></span>
                        <select id="fp-scale" class="rbx-input"><option value="1">1x</option><option value="2">2x</option></select>
                        <button class="rbx-btn primary" id="fp-export">Export PNG</button>
                        <button class="rbx-btn" id="fp-copy">Copy</button>
                    </div>
                    <div class="fp-viewport" id="fp-viewport"><canvas id="fp-canvas"></canvas></div>
                    <div class="rbx-hint">click any tile to put your game there · ← → flip between thumbnails · drop or paste a 16:9 image to add it</div>
                </div>
            </div>`;

        const canvasEl = $("#fp-canvas", root);
        const viewport = $("#fp-viewport", root);

        function syncControls() {
            $$(".range-controls[data-key]", root).forEach(group => {
                $$(".range-pill", group).forEach(b => b.classList.toggle("active", st[group.dataset.key] === b.dataset.val));
            });
            $("#fp-sidebar", root).classList.toggle("active", st.sidebar);
            $("#fp-sidebar", root).disabled = st.device === "mobile";
            $$("#fp-tests .range-pill", root).forEach(b => b.classList.toggle("active", tests[b.dataset.test]));
            $("#fp-spread", root).checked = st.spread;
            $("#fp-name", root).value = st.name;
            $("#fp-creator", root).value = st.creator;
            $("#fp-rating", root).value = st.rating;
            $("#fp-playing", root).value = st.playing;
            $("#fp-genre", root).value = st.genre;
            viewport.classList.toggle("full", st.view === "full");
        }

        function renderVariants() {
            if (st.active >= variants.length) st.active = Math.max(0, variants.length - 1);
            $("#fp-variants", root).innerHTML = variants.map((v, k) => `
                <div class="fp-variant${k === st.active ? " active" : ""}" data-k="${k}">
                    <img src="${v.url}" alt="">
                    <span class="fp-variant-label">${"ABCD"[k]}</span>
                    <button class="rbx-mini danger" data-del="${k}">✕</button>
                </div>`).join("") || '<div class="rbx-empty small">no thumbnail yet - drop one in</div>';
            $("#fp-addVariant", root).disabled = variants.length >= 4;
            const iconBox = $("#fp-icon", root);
            iconBox.innerHTML = icon ? `<img src="${icon.url}" alt="">` : '<span class="rbx-hint">auto: centre of thumbnail</span>';
            $("#fp-iconDel", root).disabled = !icon;
        }

        // full repaints are batched per frame; hover changes only blit the cached render plus an outline
        let rafPending = false;
        let needsFull = false;
        let baseCanvas = null;
        let viewScale = 1;
        function schedule(hoverOnly) {
            if (!hoverOnly) needsFull = true;
            if (rafPending) return;
            rafPending = true;
            requestAnimationFrame(() => {
                rafPending = false;
                if (needsFull || !baseCanvas) { needsFull = false; draw(); }
                drawHover();
            });
        }

        function drawHover() {
            if (!baseCanvas || !root.classList.contains("active")) return;
            const ctx = canvasEl.getContext("2d");
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.drawImage(baseCanvas, 0, 0);
            const t = hover && lastTiles.find(x => x.s === hover.s && x.i === hover.i);
            if (!t) return;
            const dpr = window.devicePixelRatio || 1;
            const r = t.kind === "thumb" ? (t.mobile ? 8 : 10) : (t.mobile ? 10 : 14);
            ctx.setTransform(viewScale * dpr, 0, 0, viewScale * dpr, 0, 0);
            roundRectPath(ctx, t.x - 3, t.y - 3, t.w + 6, t.h + 6, r + 3);
            ctx.strokeStyle = THEMES[st.theme].hover;
            ctx.globalAlpha = 0.85;
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.globalAlpha = 1;
        }

        function draw() {
            if (!root.classList.contains("active")) return;
            const [W, H] = SIZES[st.device];
            const dpr = window.devicePixelRatio || 1;
            let scale = 1;
            if (st.view === "fit") {
                const maxW = viewport.clientWidth || 800;
                const maxH = st.device === "mobile" ? Math.max(420, window.innerHeight * 0.72) : Infinity;
                scale = Math.min(maxW / W, maxH / H);
            }
            if (tests.distance) scale *= 0.35;
            viewScale = scale;
            canvasEl.width = Math.round(W * scale * dpr);
            canvasEl.height = Math.round(H * scale * dpr);
            canvasEl.style.width = W * scale + "px";
            canvasEl.style.height = H * scale + "px";
            canvasEl.style.filter = [tests.squint ? "blur(4px)" : "", tests.gray ? "grayscale(1)" : ""].join(" ").trim() || "none";
            const ctx = canvasEl.getContext("2d");
            ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
            ctx.imageSmoothingQuality = "high";
            lastTiles = paint(ctx, W, H);
            if (!baseCanvas || baseCanvas.width !== canvasEl.width || baseCanvas.height !== canvasEl.height) {
                baseCanvas = makeCanvas(canvasEl.width, canvasEl.height);
            }
            const b = baseCanvas.getContext("2d");
            b.clearRect(0, 0, baseCanvas.width, baseCanvas.height);
            b.drawImage(canvasEl, 0, 0);
        }

        function exportCanvas() {
            const [W, H] = SIZES[st.device];
            const k = Number($("#fp-scale", root).value) || 1;
            const c = makeCanvas(W * k, H * k);
            const ctx = c.getContext("2d");
            ctx.scale(k, k);
            ctx.imageSmoothingQuality = "high";
            paint(ctx, W, H);
            return c;
        }

        function tileAt(e) {
            const [W, H] = SIZES[st.device];
            const b = canvasEl.getBoundingClientRect();
            const x = (e.clientX - b.left) / b.width * W, y = (e.clientY - b.top) / b.height * H;
            return lastTiles.find(t => x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h) || null;
        }

        canvasEl.addEventListener("mousemove", e => {
            const t = tileAt(e);
            const next = t ? { s: t.s, i: t.i } : null;
            if ((next && hover && next.s === hover.s && next.i === hover.i) || (!next && !hover)) return;
            hover = next;
            canvasEl.style.cursor = t ? "pointer" : "default";
            schedule(true);
        });
        canvasEl.addEventListener("mouseleave", () => { hover = null; schedule(true); });
        canvasEl.addEventListener("click", e => {
            const t = tileAt(e);
            if (!t) return;
            if (t.game && t.game.mine && variants.length > 1 && st.spread) st.active = t.game.variant;
            st.slots[st.page] = { s: t.s, i: t.i };
            saveState();
            renderVariants();
            schedule();
        });

        $$(".range-controls[data-key]", root).forEach(group => group.addEventListener("click", e => {
            const b = e.target.closest("[data-val]");
            if (!b) return;
            st[group.dataset.key] = b.dataset.val;
            saveState();
            syncControls();
            schedule();
        }));
        $("#fp-sidebar", root).addEventListener("click", () => { st.sidebar = !st.sidebar; saveState(); syncControls(); schedule(); });
        $("#fp-tests", root).addEventListener("click", e => {
            const b = e.target.closest("[data-test]");
            if (!b) return;
            tests[b.dataset.test] = !tests[b.dataset.test];
            syncControls();
            schedule();
        });
        $("#fp-spread", root).addEventListener("change", e => { st.spread = e.target.checked; saveState(); schedule(); });
        [["#fp-name", "name", String], ["#fp-creator", "creator", String], ["#fp-rating", "rating", v => clamp(Math.round(Number(v) || 0), 0, 100)], ["#fp-playing", "playing", v => Math.max(0, Math.round(Number(v) || 0))]]
            .forEach(([sel, key, parse]) => $(sel, root).addEventListener("input", e => { st[key] = parse(e.target.value); saveState(); schedule(); }));
        $("#fp-genre", root).addEventListener("change", e => { st.genre = e.target.value; saveState(); schedule(); });
        $("#fp-shuffle", root).addEventListener("click", () => { st.seed = (st.seed + 1) % 1e9; saveState(); schedule(); });

        $("#fp-variants", root).addEventListener("click", e => {
            const del = e.target.closest("[data-del]");
            if (del) {
                const k = Number(del.dataset.del);
                iconAuto.delete(variants[k].id);
                variants.splice(k, 1);
                renderVariants();
                persistImages();
                schedule();
                return;
            }
            const v = e.target.closest("[data-k]");
            if (!v) return;
            st.active = Number(v.dataset.k);
            saveState();
            renderVariants();
            schedule();
        });

        async function addVariant(asset) {
            if (variants.length >= 4) variants.pop();
            variants.push(asset);
            st.active = variants.length - 1;
            saveState();
            renderVariants();
            persistImages();
            schedule();
        }
        async function setIcon(asset) {
            icon = asset;
            renderVariants();
            persistImages();
            schedule();
        }
        async function addFiles(files) {
            try {
                for (const f of files.slice(0, 4)) {
                    const a = await assetFromBlob(f);
                    // square images become the icon, everything else a thumbnail
                    if (Math.abs(a.w / a.h - 1) < 0.02) await setIcon(a); else await addVariant(a);
                }
            } catch (e) { fail(e); }
        }

        $("#fp-addVariant", root).addEventListener("click", async () => {
            const files = await pickFiles(true);
            for (const f of files.slice(0, 4 - variants.length)) {
                try { await addVariant(await assetFromBlob(f)); } catch (e) { fail(e); }
            }
        });
        $("#fp-iconUp", root).addEventListener("click", async () => {
            const [f] = await pickFiles(false);
            if (f) setIcon(await assetFromBlob(f)).catch(fail);
        });
        $("#fp-iconDel", root).addEventListener("click", () => setIcon(null));
        $("#fp-iconCrop", root).addEventListener("click", () => {
            const v = variants[st.active];
            if (!v) return toast("add a thumbnail first", true);
            if (!tools.crop) return;
            tools.crop.load(v, "1:1");
            window.robloxTabs.set("crop");
            toast("pick the square, then → Frontpage");
        });

        $("#fp-export", root).addEventListener("click", () => {
            try {
                canvasToBlob(exportCanvas()).then(b => downloadBlob(b, sessionName("frontpage_" + st.page + "_" + st.device + ".png"))).catch(fail);
            } catch (e) { fail(e); }
        });
        $("#fp-copy", root).addEventListener("click", () => {
            try {
                canvasToBlob(exportCanvas()).then(copyBlob).then(() => toast("copied")).catch(fail);
            } catch (e) { fail(e); }
        });

        document.addEventListener("keydown", e => {
            if (!window.robloxTabs || window.robloxTabs.active !== "frontpage") return;
            if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || variants.length < 2) return;
            if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
            e.preventDefault();
            st.active = (st.active + (e.key === "ArrowRight" ? 1 : -1) + variants.length) % variants.length;
            saveState();
            renderVariants();
            schedule();
        });
        window.addEventListener("resize", () => { if (window.robloxTabs && window.robloxTabs.active === "frontpage") schedule(); });

        function loadFeed() {
            fetch(FEED_URL, { cache: "no-cache" })
                .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
                .then(data => {
                    if (!data || !data.games || !data.sorts) throw new Error("bad feed");
                    feed = data;
                    $("#fp-genre", root).innerHTML = '<option value="all">all genres</option>'
                        + (data.genres || []).map(g => `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join("");
                    $("#fp-genre", root).value = st.genre;
                    if ($("#fp-genre", root).value !== st.genre) st.genre = "all";
                    $("#fp-feedInfo", root).textContent = Object.keys(data.games).length + " real games from Roblox charts · updated " + new Date(data.generatedAt).toLocaleDateString();
                    schedule();
                })
                .catch(() => {
                    feedError = true;
                    $("#fp-feedInfo", root).textContent = "live charts not available yet - showing placeholder games (the update-roblox-feed workflow fills them in)";
                    schedule();
                });
        }

        dropTarget(root, addFiles);
        syncControls();
        renderVariants();
        if (document.fonts) document.fonts.load("600 16px Outfit").then(schedule).catch(() => {});

        idb.get("frontpage").then(async saved => {
            if (!saved) return;
            for (const blob of saved.variants || []) {
                try { variants.push(await assetFromBlob(blob)); } catch (e) {}
            }
            if (saved.icon) { try { icon = await assetFromBlob(saved.icon); } catch (e) {} }
            renderVariants();
            schedule();
        });

        let feedRequested = false;
        tools.frontpage = {
            addFiles,
            addVariant,
            setIcon,
            shown: () => {
                if (!feedRequested) { feedRequested = true; loadFeed(); }
                schedule();
            }
        };
    })();
})();
