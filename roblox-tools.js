// ---- Roblox tools: update icon, mosaic, frontpage preview, crop. All image work stays in the browser. ----
(() => {
    "use strict";

    const $ = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const uid = () => Math.random().toString(36).slice(2, 10);

    const store = {
        get(key, fallback) {
            try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
        },
        set(key, value) {
            try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
        }
    };

    // IndexedDB key/value store for work that holds images (blobs are too big for localStorage)
    const idb = (() => {
        let dbPromise = null;
        function open() {
            if (dbPromise) return dbPromise;
            dbPromise = new Promise((resolve, reject) => {
                const req = indexedDB.open("perc-roblox", 1);
                req.onupgradeneeded = () => req.result.createObjectStore("kv");
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
            return dbPromise;
        }
        function run(mode, fn) {
            return open().then(db => new Promise((resolve, reject) => {
                const tx = db.transaction("kv", mode);
                const req = fn(tx.objectStore("kv"));
                tx.oncomplete = () => resolve(req.result);
                tx.onerror = () => reject(tx.error);
            }));
        }
        return {
            get: key => run("readonly", s => s.get(key)).catch(() => undefined),
            set: (key, value) => run("readwrite", s => s.put(value, key)).catch(() => {}),
            del: key => run("readwrite", s => s.delete(key)).catch(() => {})
        };
    })();

    // ---- images ----
    function loadImage(src, cors) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            if (cors) img.crossOrigin = "anonymous";
            img.decoding = "async";
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src;
        });
    }

    // an "asset" is an uploaded image: { id, blob, url, img, w, h }
    function assetFromBlob(blob) {
        const url = URL.createObjectURL(blob);
        return loadImage(url).then(img => ({ id: uid(), blob, url, img, w: img.naturalWidth, h: img.naturalHeight }));
    }

    function canvasToBlob(canvas) {
        return new Promise((resolve, reject) => {
            try {
                canvas.toBlob(b => b ? resolve(b) : reject(new Error("export failed")), "image/png");
            } catch (e) {
                reject(e);
            }
        });
    }

    function assetFromCanvas(canvas) {
        return canvasToBlob(canvas).then(assetFromBlob);
    }

    const imageFiles = list => Array.from(list || []).filter(f => f && /^image\//.test(f.type));

    function pickFiles(multiple) {
        return new Promise(resolve => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = "image/*";
            input.multiple = !!multiple;
            input.addEventListener("change", () => resolve(imageFiles(input.files)));
            input.click();
        });
    }

    function makeCanvas(w, h) {
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(w));
        c.height = Math.max(1, Math.round(h));
        return c;
    }

    // Draws a source region to w x h, halving step by step on big downscales so small icons stay sharp
    function resample(src, sx, sy, sw, sh, w, h) {
        let cur = makeCanvas(sw, sh);
        let ctx = cur.getContext("2d");
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(src, sx, sy, sw, sh, 0, 0, cur.width, cur.height);
        while (cur.width / 2 >= w && cur.height / 2 >= h) {
            const next = makeCanvas(cur.width / 2, cur.height / 2);
            ctx = next.getContext("2d");
            ctx.imageSmoothingQuality = "high";
            ctx.drawImage(cur, 0, 0, next.width, next.height);
            cur = next;
        }
        const out = makeCanvas(w, h);
        ctx = out.getContext("2d");
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(cur, 0, 0, out.width, out.height);
        return out;
    }

    // cover-fit an image into a box
    function drawCover(ctx, img, x, y, w, h, iw, ih) {
        iw = iw || img.naturalWidth || img.width;
        ih = ih || img.naturalHeight || img.height;
        const s = Math.max(w / iw, h / ih);
        const sw = w / s, sh = h / s;
        ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
    }

    function roundRectPath(ctx, x, y, w, h, r) {
        r = Math.max(0, Math.min(r, w / 2, h / 2));
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    // Cached downscaled copy of an asset (shorter side = minSide) so previews don't redraw from full resolution
    function previewOf(asset, minSide) {
        const key = "_preview" + minSide;
        if (asset[key]) return asset[key];
        const k = minSide / Math.min(asset.w, asset.h);
        asset[key] = k >= 1
            ? { src: asset.img, k: 1 }
            : { src: resample(asset.img, 0, 0, asset.w, asset.h, asset.w * k, asset.h * k), k };
        return asset[key];
    }

    // center square crop of an asset, as a canvas
    function squareOf(asset, size) {
        const s = Math.min(asset.w, asset.h);
        return resample(asset.img, (asset.w - s) / 2, (asset.h - s) / 2, s, s, size || s, size || s);
    }

    // ---- output: download, clipboard, zip, folder ----
    function downloadBlob(blob, name) {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }

    async function copyBlob(blob) {
        if (!navigator.clipboard || !window.ClipboardItem) throw new Error("clipboard images not supported in this browser");
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    }

    const CRC_TABLE = (() => {
        const t = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
            t[n] = c >>> 0;
        }
        return t;
    })();

    function crc32(bytes) {
        let c = 0xFFFFFFFF;
        for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
        return (c ^ 0xFFFFFFFF) >>> 0;
    }

    // Minimal store-only zip (PNGs are already compressed)
    async function makeZip(files) {
        const enc = new TextEncoder();
        const now = new Date();
        const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
        const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
        const local = [];
        const central = [];
        let offset = 0;
        for (const f of files) {
            const data = new Uint8Array(await f.blob.arrayBuffer());
            const name = enc.encode(f.name);
            const crc = crc32(data);
            const h = new DataView(new ArrayBuffer(30));
            h.setUint32(0, 0x04034b50, true);
            h.setUint16(4, 20, true);
            h.setUint16(6, 0x0800, true);
            h.setUint16(10, time, true);
            h.setUint16(12, date, true);
            h.setUint32(14, crc, true);
            h.setUint32(18, data.length, true);
            h.setUint32(22, data.length, true);
            h.setUint16(26, name.length, true);
            local.push(h.buffer, name, data);
            const c = new DataView(new ArrayBuffer(46));
            c.setUint32(0, 0x02014b50, true);
            c.setUint16(4, 20, true);
            c.setUint16(6, 20, true);
            c.setUint16(8, 0x0800, true);
            c.setUint16(12, time, true);
            c.setUint16(14, date, true);
            c.setUint32(16, crc, true);
            c.setUint32(20, data.length, true);
            c.setUint32(24, data.length, true);
            c.setUint16(28, name.length, true);
            c.setUint32(42, offset, true);
            central.push(c.buffer, name);
            offset += 30 + name.length + data.length;
        }
        const size = central.reduce((n, p) => n + p.byteLength, 0);
        const end = new DataView(new ArrayBuffer(22));
        end.setUint32(0, 0x06054b50, true);
        end.setUint16(8, files.length, true);
        end.setUint16(10, files.length, true);
        end.setUint32(12, size, true);
        end.setUint32(16, offset, true);
        return new Blob([...local, ...central, end.buffer], { type: "application/zip" });
    }

    // picked folder for "save to folder" (File System Access API, Chromium only)
    let folderHandle = null;
    const canPickFolder = typeof window.showDirectoryPicker === "function";

    async function freeName(dir, name) {
        const dot = name.lastIndexOf(".");
        const base = dot > 0 ? name.slice(0, dot) : name;
        const ext = dot > 0 ? name.slice(dot) : "";
        for (let n = 1; ; n++) {
            const candidate = n === 1 ? name : base + "_" + n + ext;
            try { await dir.getFileHandle(candidate); } catch (e) { return candidate; }
        }
    }

    async function saveToFolder(files) {
        if (!folderHandle) folderHandle = await window.showDirectoryPicker({ mode: "readwrite" });
        for (const f of files) {
            const handle = await folderHandle.getFileHandle(await freeName(folderHandle, f.name), { create: true });
            const w = await handle.createWritable();
            await w.write(f.blob);
            await w.close();
        }
    }

    // repeat downloads in one session get _2, _3...
    const usedNames = {};
    function sessionName(name) {
        const n = (usedNames[name] || 0) + 1;
        usedNames[name] = n;
        return n === 1 ? name : name.replace(/(\.[a-z0-9]+)$/i, "_" + n + "$1");
    }

    const slug = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "image";

    // ---- toast ----
    let toastEl = null;
    let toastTimer = null;
    function toast(msg, isError) {
        if (!toastEl) {
            toastEl = document.createElement("div");
            toastEl.className = "rbx-toast";
            document.body.appendChild(toastEl);
        }
        toastEl.textContent = msg;
        toastEl.classList.toggle("error", !!isError);
        toastEl.classList.add("show");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2600);
    }

    const fail = err => {
        console.error(err);
        if (err && err.name === "AbortError") return;
        toast(err && err.name === "SecurityError" ? "export blocked: some images don't allow it (CORS)" : (err && err.message) || "something went wrong", true);
    };

    // make an element a drop target for image files
    function dropTarget(el, onFiles) {
        el.addEventListener("dragover", e => {
            if (!e.dataTransfer || !Array.from(e.dataTransfer.types).includes("Files")) return;
            e.preventDefault();
            el.classList.add("drag-over");
        });
        el.addEventListener("dragleave", e => { if (!el.contains(e.relatedTarget)) el.classList.remove("drag-over"); });
        el.addEventListener("drop", e => {
            el.classList.remove("drag-over");
            const files = imageFiles(e.dataTransfer && e.dataTransfer.files);
            if (!files.length) return;
            e.preventDefault();
            e.stopPropagation();
            onFiles(files);
        });
    }

    const icons = () => { if (window.lucide) window.lucide.createIcons(); };

    function slider(id, label, min, max, step, unit) {
        return `<label class="rbx-slider">${label}<span class="rbx-val" data-for="${id}"></span>
            <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" data-unit="${unit || ""}"></label>`;
    }

    function syncSliderLabels(root) {
        $$("input[type=range]", root).forEach(input => {
            const out = $(`.rbx-val[data-for="${input.id}"]`, root);
            if (out) out.textContent = input.value + input.dataset.unit;
        });
    }

    // tools register here so they can hand images to each other
    const tools = {};
    // don't let a slow font CDN block rendering for more than a moment
    const fontsReady = Promise.race([
        document.fonts ? document.fonts.load("800 64px Outfit").catch(() => {}) : Promise.resolve(),
        new Promise(r => setTimeout(r, 1500))
    ]);

    // =====================================================================
    // Update Icon: countdown overlay (hourglass + text) over a darkened icon
    // =====================================================================
    (() => {
        const root = document.getElementById("rbx-icon");
        if (!root) return;

        const DEFAULT_STYLE = { dark: 45, ovSize: 44, ovY: 40, txtSize: 15, txtY: 80, outline: true, outlineW: 6 };
        const DEFAULT_SEQUENCE = "24 HOURS, 12 HOURS, 6 HOURS, 3 HOURS, 1 HOUR, 30 MINS, 10 MINS, NOW!";
        let style = Object.assign({}, DEFAULT_STYLE, store.get("rbxIconStyle", {}));
        let presets = store.get("rbxIconPresets", {});
        let customOverlay = null; // HTMLImageElement
        let cards = []; // { id, asset, text, ox, oy }

        // white hourglass glyph, drawn once
        const hourglass = (() => {
            const S = 512;
            const c = makeCanvas(S, S);
            const ctx = c.getContext("2d");
            ctx.fillStyle = "#fff";
            ctx.strokeStyle = "#fff";
            const w = S * 0.66, x0 = (S - w) / 2, bar = S * 0.085, top = S * 0.04, bottom = S * 0.96;
            roundRectPath(ctx, x0, top, w, bar, bar / 2);
            ctx.fill();
            roundRectPath(ctx, x0, bottom - bar, w, bar, bar / 2);
            ctx.fill();
            const gx = S * 0.2, gTop = top + bar, gBot = bottom - bar, mid = S / 2, neck = S * 0.045;
            ctx.lineWidth = S * 0.05;
            ctx.lineJoin = "round";
            ctx.beginPath();
            ctx.moveTo(S / 2 - (S / 2 - gx) * 0.92, gTop);
            ctx.bezierCurveTo(gx, mid - S * 0.12, mid - neck, mid - S * 0.05, mid - neck, mid);
            ctx.bezierCurveTo(mid - neck, mid + S * 0.05, gx, mid + S * 0.12, S / 2 - (S / 2 - gx) * 0.92, gBot);
            ctx.moveTo(S / 2 + (S / 2 - gx) * 0.92, gTop);
            ctx.bezierCurveTo(S - gx, mid - S * 0.12, mid + neck, mid - S * 0.05, mid + neck, mid);
            ctx.bezierCurveTo(mid + neck, mid + S * 0.05, S - gx, mid + S * 0.12, S / 2 + (S / 2 - gx) * 0.92, gBot);
            ctx.stroke();
            // sand: a small wedge on top, a mound below, a thin falling stream
            ctx.beginPath();
            ctx.moveTo(S * 0.36, mid - S * 0.13);
            ctx.lineTo(S * 0.64, mid - S * 0.13);
            ctx.lineTo(mid, mid - S * 0.02);
            ctx.closePath();
            ctx.fill();
            ctx.fillRect(mid - S * 0.008, mid - S * 0.02, S * 0.016, S * 0.2);
            ctx.beginPath();
            ctx.moveTo(S * 0.27, gBot - S * 0.01);
            ctx.quadraticCurveTo(mid, gBot - S * 0.28, S * 0.73, gBot - S * 0.01);
            ctx.closePath();
            ctx.fill();
            return c;
        })();

        // black silhouette of a glyph, used to fake an outline
        function silhouette(src) {
            const c = makeCanvas(src.naturalWidth || src.width, src.naturalHeight || src.height);
            const ctx = c.getContext("2d");
            ctx.drawImage(src, 0, 0);
            ctx.globalCompositeOperation = "source-in";
            ctx.fillStyle = "#000";
            ctx.fillRect(0, 0, c.width, c.height);
            return c;
        }

        // glyph + outline baked at one size, so each icon is a single drawImage instead of 25
        let glyphCache = { key: "", canvas: null };
        function outlinedGlyph(glyph, dw, dh, ol) {
            const key = [glyph.src || "hourglass", dw.toFixed(1), dh.toFixed(1), ol.toFixed(2)].join("|");
            if (glyphCache.key === key && glyphCache.glyph === glyph) return glyphCache.canvas;
            const pad = Math.ceil(ol) + 1;
            const c = makeCanvas(dw + pad * 2, dh + pad * 2);
            const ctx = c.getContext("2d");
            ctx.imageSmoothingQuality = "high";
            const scaled = makeCanvas(dw, dh);
            const sctx = scaled.getContext("2d");
            sctx.imageSmoothingQuality = "high";
            sctx.drawImage(glyph, 0, 0, scaled.width, scaled.height);
            if (ol > 0) {
                const sil = silhouette(scaled);
                for (let i = 0; i < 24; i++) {
                    const t = i / 24 * Math.PI * 2;
                    ctx.drawImage(sil, pad + Math.cos(t) * ol, pad + Math.sin(t) * ol);
                }
            }
            ctx.drawImage(scaled, pad, pad);
            glyphCache = { key, glyph, canvas: c };
            return c;
        }

        function renderIcon(card, size) {
            const a = card.asset;
            const S = Math.min(a.w, a.h);
            const out = size || Math.min(S, 2048);
            const sx = (a.w - S) * card.ox, sy = (a.h - S) * card.oy;
            let c;
            if (size && size <= 512) {
                // preview: the cropped square is cached per card until the crop moves
                const key = size + "|" + card.ox + "|" + card.oy;
                if (!card.base || card.base.key !== key || card.base.asset !== a) {
                    const p = previewOf(a, size * 2);
                    const b = makeCanvas(out, out);
                    const bx = b.getContext("2d");
                    bx.imageSmoothingQuality = "high";
                    bx.drawImage(p.src, sx * p.k, sy * p.k, S * p.k, S * p.k, 0, 0, out, out);
                    card.base = { key, asset: a, canvas: b };
                }
                c = makeCanvas(out, out);
                c.getContext("2d").drawImage(card.base.canvas, 0, 0);
            } else if (out < S / 2) {
                c = resample(a.img, sx, sy, S, S, out, out);
            } else {
                c = makeCanvas(out, out);
                const x = c.getContext("2d");
                x.imageSmoothingQuality = "high";
                x.drawImage(a.img, sx, sy, S, S, 0, 0, out, out);
            }
            const ctx = c.getContext("2d");
            ctx.fillStyle = `rgba(0,0,0,${style.dark / 100})`;
            ctx.fillRect(0, 0, out, out);

            const k = out / 512;
            const ol = style.outline ? style.outlineW * k : 0;

            const glyph = customOverlay || hourglass;
            const gw = glyph.naturalWidth || glyph.width, gh = glyph.naturalHeight || glyph.height;
            const box = out * style.ovSize / 100;
            const gs = Math.min(box / gw, box / gh);
            const dw = gw * gs, dh = gh * gs;
            const gx = (out - dw) / 2, gy = out * style.ovY / 100 - dh / 2;
            const pad = Math.ceil(ol) + 1;
            ctx.drawImage(outlinedGlyph(glyph, dw, dh, ol), gx - pad, gy - pad);

            const text = (card.text || "").trim();
            if (text) {
                let px = out * style.txtSize / 100;
                ctx.font = `800 ${px}px Outfit, sans-serif`;
                const maxW = out * 0.92 - ol * 2;
                const measured = ctx.measureText(text).width;
                if (measured > maxW) {
                    px *= maxW / measured;
                    ctx.font = `800 ${px}px Outfit, sans-serif`;
                }
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                const ty = out * style.txtY / 100;
                if (ol > 0) {
                    ctx.lineJoin = "round";
                    ctx.lineWidth = ol * 2;
                    ctx.strokeStyle = "#000";
                    ctx.strokeText(text, out / 2, ty);
                }
                ctx.fillStyle = "#fff";
                ctx.fillText(text, out / 2, ty);
            }
            return c;
        }

        root.innerHTML = `
            <div class="rbx-grid-2">
                <div class="rbx-card rbx-controls">
                    <div class="rbx-card-title">Style</div>
                    ${slider("ic-dark", "Background darkness", 0, 90, 1, "%")}
                    ${slider("ic-ovSize", "Overlay size", 10, 90, 1, "%")}
                    ${slider("ic-ovY", "Overlay position", 10, 90, 1, "%")}
                    ${slider("ic-txtSize", "Text size", 5, 30, 0.5, "%")}
                    ${slider("ic-txtY", "Text position", 10, 95, 1, "%")}
                    <label class="rbx-check"><input type="checkbox" id="ic-outline"> Black outline</label>
                    ${slider("ic-outlineW", "Outline width", 1, 20, 0.5, "")}
                    <div class="rbx-row">
                        <button class="rbx-btn" id="ic-overlay">Custom overlay</button>
                        <button class="rbx-btn ghost" id="ic-overlayReset" hidden>Use hourglass</button>
                        <button class="rbx-btn ghost" id="ic-reset">Reset style</button>
                    </div>
                    <div class="rbx-card-title">Presets</div>
                    <div class="rbx-row">
                        <select id="ic-presets" class="rbx-input"></select>
                        <button class="rbx-btn" id="ic-presetLoad">Load</button>
                        <button class="rbx-btn ghost" id="ic-presetDel">Delete</button>
                    </div>
                    <div class="rbx-row">
                        <input id="ic-presetName" class="rbx-input" placeholder="preset name">
                        <button class="rbx-btn" id="ic-presetSave">Save</button>
                    </div>
                    <div class="rbx-card-title">Countdown set</div>
                    <input id="ic-sequence" class="rbx-input" spellcheck="false">
                    <div class="rbx-hint">comma separated · "Generate set" on a card makes one icon per step</div>
                </div>
                <div class="rbx-card">
                    <div class="rbx-drop" id="ic-drop">
                        <i data-lucide="image-plus"></i>
                        <div>drop, paste (ctrl+v) or click to add icons</div>
                        <div class="rbx-hint">non-square images are cropped to 1:1 · drag a preview to move the crop, double-click to recenter</div>
                    </div>
                    <div class="rbx-row rbx-export">
                        <input id="ic-prefix" class="rbx-input" placeholder="filename prefix" spellcheck="false">
                        <select id="ic-format" class="rbx-input">
                            <option value="zip">.zip</option>
                            <option value="png">separate PNGs</option>
                        </select>
                        <select id="ic-dest" class="rbx-input">
                            <option value="downloads">to downloads</option>
                            ${canPickFolder ? '<option value="folder">to a folder…</option>' : ""}
                        </select>
                        <button class="rbx-btn primary" id="ic-all">Download all</button>
                        <button class="rbx-btn ghost" id="ic-clear">Clear</button>
                    </div>
                    <div class="ic-cards" id="ic-cards"></div>
                </div>
            </div>`;

        const cardsEl = $("#ic-cards", root);
        const keys = ["dark", "ovSize", "ovY", "txtSize", "txtY", "outlineW"];

        function syncControls() {
            keys.forEach(k => { $("#ic-" + k, root).value = style[k]; });
            $("#ic-outline", root).checked = !!style.outline;
            syncSliderLabels(root);
        }

        let rafPending = false;
        function redrawAll() {
            if (rafPending) return;
            rafPending = true;
            requestAnimationFrame(() => {
                rafPending = false;
                cards.forEach(drawPreview);
            });
        }

        function drawPreview(card) {
            const el = cardsEl.querySelector(`[data-id="${card.id}"] canvas`);
            if (!el) return;
            const r = renderIcon(card, 384);
            el.width = r.width;
            el.height = r.height;
            el.getContext("2d").drawImage(r, 0, 0);
        }

        function renderCards() {
            cardsEl.innerHTML = cards.map(c => `
                <div class="ic-card" data-id="${c.id}">
                    <canvas class="ic-preview" title="drag to move the crop · double-click to recenter"></canvas>
                    <input class="rbx-input ic-text" value="${esc(c.text)}" spellcheck="false" placeholder="countdown text">
                    <div class="ic-actions">
                        <button class="rbx-mini" data-act="set" title="Generate countdown set">set</button>
                        <button class="rbx-mini" data-act="dup" title="Duplicate">dup</button>
                        <button class="rbx-mini" data-act="copy" title="Copy PNG">copy</button>
                        <button class="rbx-mini" data-act="save" title="Download PNG">png</button>
                        <button class="rbx-mini" data-act="front" title="Preview on frontpage">→ front</button>
                        <button class="rbx-mini danger" data-act="del" title="Remove">✕</button>
                    </div>
                </div>`).join("") || '<div class="rbx-empty">no icons yet</div>';
            cards.forEach(drawPreview);
        }

        async function addAssets(assets, text) {
            await fontsReady;
            assets.forEach(asset => cards.push({ id: uid(), asset, text: text == null ? "24 HOURS" : text, ox: 0.5, oy: 0.5 }));
            renderCards();
        }

        async function addFiles(files) {
            try { await addAssets(await Promise.all(files.map(assetFromBlob))); } catch (e) { fail(e); }
        }

        const fileName = (card, i) => {
            const prefix = slug($("#ic-prefix", root).value);
            return (prefix !== "image" ? prefix + "_" : "") + String(i + 1).padStart(2, "0") + "_" + slug(card.text) + ".png";
        };

        async function exportCard(card) {
            return canvasToBlob(renderIcon(card));
        }

        async function saveFiles(files) {
            const dest = $("#ic-dest", root).value;
            if (dest === "folder") {
                await saveToFolder(files);
                toast("saved " + files.length + " file" + (files.length === 1 ? "" : "s") + " to " + folderHandle.name);
                return;
            }
            files.forEach(f => downloadBlob(f.blob, sessionName(f.name)));
        }

        cardsEl.addEventListener("input", e => {
            if (!e.target.classList.contains("ic-text")) return;
            const card = cards.find(c => c.id === e.target.closest(".ic-card").dataset.id);
            card.text = e.target.value;
            drawPreview(card);
        });

        cardsEl.addEventListener("click", async e => {
            const btn = e.target.closest("[data-act]");
            if (!btn) return;
            const idx = cards.findIndex(c => c.id === btn.closest(".ic-card").dataset.id);
            const card = cards[idx];
            try {
                switch (btn.dataset.act) {
                    case "del":
                        cards.splice(idx, 1);
                        renderCards();
                        break;
                    case "dup":
                        cards.splice(idx + 1, 0, Object.assign({}, card, { id: uid() }));
                        renderCards();
                        break;
                    case "set": {
                        const steps = $("#ic-sequence", root).value.split(",").map(s => s.trim()).filter(Boolean);
                        if (!steps.length) return;
                        const set = steps.map(text => Object.assign({}, card, { id: uid(), text }));
                        cards.splice(idx, 1, ...set);
                        renderCards();
                        toast(set.length + " icons generated");
                        break;
                    }
                    case "copy":
                        await copyBlob(await exportCard(card));
                        toast("copied");
                        break;
                    case "save":
                        await saveFiles([{ name: fileName(card, idx), blob: await exportCard(card) }]);
                        break;
                    case "front":
                        if (tools.frontpage) {
                            await tools.frontpage.setIcon(await assetFromCanvas(renderIcon(card, 512)));
                            window.robloxTabs.set("frontpage");
                        }
                        break;
                }
            } catch (err) { fail(err); }
        });

        // drag a preview to move the 1:1 crop window over a non-square image
        let drag = null;
        cardsEl.addEventListener("pointerdown", e => {
            const cv = e.target.closest(".ic-preview");
            if (!cv) return;
            const card = cards.find(c => c.id === cv.closest(".ic-card").dataset.id);
            if (card.asset.w === card.asset.h) return;
            cv.setPointerCapture(e.pointerId);
            drag = { card, cv, x: e.clientX, y: e.clientY, ox: card.ox, oy: card.oy };
        });
        cardsEl.addEventListener("pointermove", e => {
            if (!drag) return;
            const a = drag.card.asset;
            const S = Math.min(a.w, a.h);
            const perPx = S / drag.cv.getBoundingClientRect().width;
            if (a.w > S) drag.card.ox = clamp(drag.ox - (e.clientX - drag.x) * perPx / (a.w - S), 0, 1);
            if (a.h > S) drag.card.oy = clamp(drag.oy - (e.clientY - drag.y) * perPx / (a.h - S), 0, 1);
            drawPreview(drag.card);
        });
        const endDrag = () => { drag = null; };
        cardsEl.addEventListener("pointerup", endDrag);
        cardsEl.addEventListener("pointercancel", endDrag);
        cardsEl.addEventListener("dblclick", e => {
            const cv = e.target.closest(".ic-preview");
            if (!cv) return;
            const card = cards.find(c => c.id === cv.closest(".ic-card").dataset.id);
            card.ox = card.oy = 0.5;
            drawPreview(card);
        });

        // style controls
        keys.forEach(k => $("#ic-" + k, root).addEventListener("input", e => {
            style[k] = Number(e.target.value);
            store.set("rbxIconStyle", style);
            syncSliderLabels(root);
            redrawAll();
        }));
        $("#ic-outline", root).addEventListener("change", e => {
            style.outline = e.target.checked;
            store.set("rbxIconStyle", style);
            redrawAll();
        });
        $("#ic-reset", root).addEventListener("click", () => {
            style = Object.assign({}, DEFAULT_STYLE);
            store.set("rbxIconStyle", style);
            syncControls();
            redrawAll();
        });

        // custom overlay (kept in localStorage as a data URL when it fits)
        function setOverlay(img) {
            customOverlay = img;
            $("#ic-overlayReset", root).hidden = !img;
            redrawAll();
        }
        const savedOverlay = store.get("rbxIconOverlay", null);
        if (savedOverlay) loadImage(savedOverlay).then(setOverlay).catch(() => {});
        $("#ic-overlay", root).addEventListener("click", async () => {
            const [file] = await pickFiles(false);
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                loadImage(reader.result).then(img => {
                    setOverlay(img);
                    if (!store.set("rbxIconOverlay", reader.result)) toast("overlay too big to remember, used for this session only");
                }).catch(fail);
            };
            reader.readAsDataURL(file);
        });
        $("#ic-overlayReset", root).addEventListener("click", () => {
            try { localStorage.removeItem("rbxIconOverlay"); } catch (e) {}
            setOverlay(null);
        });

        // presets
        function renderPresets() {
            const names = Object.keys(presets);
            $("#ic-presets", root).innerHTML = names.length
                ? names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join("")
                : '<option value="">no presets</option>';
        }
        $("#ic-presetSave", root).addEventListener("click", () => {
            const name = $("#ic-presetName", root).value.trim();
            if (!name) return toast("name the preset first", true);
            presets[name] = Object.assign({}, style);
            store.set("rbxIconPresets", presets);
            $("#ic-presetName", root).value = "";
            renderPresets();
            $("#ic-presets", root).value = name;
            toast("preset saved");
        });
        $("#ic-presetLoad", root).addEventListener("click", () => {
            const p = presets[$("#ic-presets", root).value];
            if (!p) return;
            style = Object.assign({}, DEFAULT_STYLE, p);
            store.set("rbxIconStyle", style);
            syncControls();
            redrawAll();
        });
        $("#ic-presetDel", root).addEventListener("click", () => {
            delete presets[$("#ic-presets", root).value];
            store.set("rbxIconPresets", presets);
            renderPresets();
        });

        const seqEl = $("#ic-sequence", root);
        seqEl.value = store.get("rbxIconSequence", DEFAULT_SEQUENCE);
        seqEl.addEventListener("change", () => store.set("rbxIconSequence", seqEl.value));

        const prefs = store.get("rbxIconExport", {});
        if (prefs.format) $("#ic-format", root).value = prefs.format;
        if (prefs.prefix) $("#ic-prefix", root).value = prefs.prefix;
        if (prefs.dest && canPickFolder) $("#ic-dest", root).value = prefs.dest;
        const savePrefs = () => store.set("rbxIconExport", { format: $("#ic-format", root).value, prefix: $("#ic-prefix", root).value, dest: $("#ic-dest", root).value });
        ["#ic-format", "#ic-prefix", "#ic-dest"].forEach(s => $(s, root).addEventListener("change", savePrefs));
        $("#ic-dest", root).addEventListener("change", e => { if (e.target.value === "folder") folderHandle = null; });

        $("#ic-all", root).addEventListener("click", async () => {
            if (!cards.length) return toast("add some icons first", true);
            try {
                const files = [];
                for (let i = 0; i < cards.length; i++) files.push({ name: fileName(cards[i], i), blob: await exportCard(cards[i]) });
                if ($("#ic-format", root).value === "zip") {
                    const prefix = slug($("#ic-prefix", root).value);
                    await saveFiles([{ name: (prefix !== "image" ? prefix : "update-icons") + ".zip", blob: await makeZip(files) }]);
                } else {
                    await saveFiles(files);
                }
            } catch (err) { fail(err); }
        });
        $("#ic-clear", root).addEventListener("click", () => { cards = []; renderCards(); });

        const drop = $("#ic-drop", root);
        drop.addEventListener("click", async () => addFiles(await pickFiles(true)));
        dropTarget(root, addFiles);

        renderPresets();
        syncControls();
        renderCards();
        fontsReady.then(redrawAll);

        tools.icon = {
            addFiles,
            addAsset: asset => addAssets([asset])
        };
    })();

    // =====================================================================
    // Mosaic: thumbnail grid builder
    // =====================================================================
    (() => {
        const root = document.getElementById("rbx-mosaic");
        if (!root) return;

        const FORMATS = { "2x2": [2, 2], "3x2": [3, 2], "4x2": [4, 2], "3x3": [3, 3], "4x3": [4, 3] };
        const RATIOS = { "16:9": 16 / 9, "1:1": 1, "4:5": 4 / 5 };
        const RES = { "1080p": 1080, "2k": 1440, "4k": 2160 };
        const DEFAULTS = { format: "2x2", ratio: "16:9", gap: 8, radius: 12, bg: "#000000", sat: 100, con: 100, vig: 0 };

        let settings = Object.assign({}, DEFAULTS);
        let slots = []; // asset id or null per cell
        const assets = new Map(); // id -> asset
        let undoStack = [];
        let redoStack = [];
        let presets = store.get("rbxMosaicPresets", {});

        const dims = () => FORMATS[settings.format];
        const cellCount = () => dims()[0] * dims()[1];

        function fitSlots() {
            const n = cellCount();
            if (slots.length < n) slots = slots.concat(Array(n - slots.length).fill(null));
            // keep images that no longer fit at the end of the list so a bigger format brings them back
            return n;
        }

        const snapshot = () => JSON.stringify({ settings, slots });
        function pushUndo() {
            undoStack.push(snapshot());
            if (undoStack.length > 40) undoStack.shift();
            redoStack = [];
        }
        function restore(snap) {
            const s = JSON.parse(snap);
            settings = s.settings;
            slots = s.slots;
            syncControls();
            render();
            persist();
        }
        function undo() { if (!undoStack.length) return; redoStack.push(snapshot()); restore(undoStack.pop()); }
        function redo() { if (!redoStack.length) return; undoStack.push(snapshot()); restore(redoStack.pop()); }

        // canvas size for a given short side
        function canvasSize(short) {
            const r = RATIOS[settings.ratio];
            return r >= 1 ? [Math.round(short * r), short] : [short, Math.round(short / r)];
        }

        function cellRects(W, H, scale) {
            const [cols, rows] = dims();
            const gap = settings.gap * scale;
            const cw = (W - gap * (cols + 1)) / cols;
            const ch = (H - gap * (rows + 1)) / rows;
            const rects = [];
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) rects.push({ x: gap + c * (cw + gap), y: gap + r * (ch + gap), w: cw, h: ch });
            }
            return rects;
        }

        function draw(short, preview) {
            const [W, H] = canvasSize(short);
            const scale = Math.min(W, H) / 1080;
            const c = makeCanvas(W, H);
            const ctx = c.getContext("2d");
            ctx.imageSmoothingQuality = "high";
            ctx.fillStyle = settings.bg;
            ctx.fillRect(0, 0, W, H);
            const filter = `saturate(${settings.sat}%) contrast(${settings.con}%)`;
            cellRects(W, H, scale).forEach((r, i) => {
                const asset = assets.get(slots[i]);
                ctx.save();
                roundRectPath(ctx, r.x, r.y, r.w, r.h, settings.radius * scale);
                ctx.clip();
                if (asset) {
                    ctx.filter = filter;
                    if (preview) {
                        const p = previewOf(asset, 540);
                        drawCover(ctx, p.src, r.x, r.y, r.w, r.h, asset.w * p.k, asset.h * p.k);
                    } else {
                        drawCover(ctx, asset.img, r.x, r.y, r.w, r.h, asset.w, asset.h);
                    }
                    ctx.filter = "none";
                } else {
                    ctx.fillStyle = "rgba(255,255,255,0.06)";
                    ctx.fillRect(r.x, r.y, r.w, r.h);
                }
                ctx.restore();
            });
            if (settings.vig > 0) {
                const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) / 2);
                g.addColorStop(0, "rgba(0,0,0,0)");
                g.addColorStop(1, `rgba(0,0,0,${settings.vig / 100})`);
                ctx.fillStyle = g;
                ctx.fillRect(0, 0, W, H);
            }
            return c;
        }

        root.innerHTML = `
            <div class="rbx-grid-2">
                <div class="rbx-card rbx-controls">
                    <div class="rbx-card-title">Layout</div>
                    <div class="range-controls" id="mo-formats">${Object.keys(FORMATS).map(f => `<button class="range-pill" data-format="${f}">${f.replace("x", "×")}</button>`).join("")}</div>
                    <div class="range-controls" id="mo-ratios">${Object.keys(RATIOS).map(r => `<button class="range-pill" data-ratio="${r}">${r}</button>`).join("")}</div>
                    ${slider("mo-gap", "Gap", 0, 60, 1, "px")}
                    ${slider("mo-radius", "Rounded corners", 0, 80, 1, "px")}
                    <label class="rbx-slider">Background <input type="color" id="mo-bg" class="rbx-color"></label>
                    <div class="rbx-card-title">Filters</div>
                    ${slider("mo-sat", "Saturation", 0, 200, 1, "%")}
                    ${slider("mo-con", "Contrast", 50, 150, 1, "%")}
                    ${slider("mo-vig", "Vignette", 0, 100, 1, "%")}
                    <div class="rbx-row">
                        <button class="rbx-btn" id="mo-auto" title="Most vivid images go in the middle">Auto-arrange</button>
                        <button class="rbx-btn ghost" id="mo-undo" title="ctrl+z">Undo</button>
                        <button class="rbx-btn ghost" id="mo-redo" title="ctrl+shift+z">Redo</button>
                    </div>
                    <div class="rbx-card-title">Presets</div>
                    <div class="rbx-row">
                        <select id="mo-presets" class="rbx-input"></select>
                        <button class="rbx-btn" id="mo-presetLoad">Load</button>
                    </div>
                    <div class="rbx-row">
                        <input id="mo-presetName" class="rbx-input" placeholder="preset name">
                        <button class="rbx-btn" id="mo-presetSave">Save</button>
                    </div>
                    <div class="rbx-card-title">Boards</div>
                    <div class="rbx-hint">a board saves the whole mosaic, images included</div>
                    <div class="rbx-row">
                        <select id="mo-boards" class="rbx-input"></select>
                        <button class="rbx-btn" id="mo-boardLoad">Open</button>
                        <button class="rbx-btn ghost" id="mo-boardDel">Delete</button>
                    </div>
                    <div class="rbx-row">
                        <input id="mo-boardName" class="rbx-input" placeholder="board name">
                        <button class="rbx-btn" id="mo-boardSave">Save</button>
                    </div>
                </div>
                <div class="rbx-card">
                    <div class="mo-stage" id="mo-stage">
                        <canvas id="mo-canvas"></canvas>
                        <div class="mo-slots" id="mo-slots"></div>
                    </div>
                    <div class="rbx-hint">drop or paste images to fill empty slots · click an empty slot to pick one · drag slots to reorder</div>
                    <div class="rbx-row rbx-export">
                        <select id="mo-res" class="rbx-input">${Object.keys(RES).map(r => `<option value="${r}">${r}</option>`).join("")}</select>
                        <button class="rbx-btn primary" id="mo-export">Export PNG</button>
                        <button class="rbx-btn" id="mo-copy">Copy</button>
                        <button class="rbx-btn ghost" id="mo-clear">Clear</button>
                    </div>
                </div>
            </div>`;

        const canvasEl = $("#mo-canvas", root);
        const slotsEl = $("#mo-slots", root);
        const sliders = ["gap", "radius", "sat", "con", "vig"];

        function syncControls() {
            sliders.forEach(k => { $("#mo-" + k, root).value = settings[k]; });
            $("#mo-bg", root).value = settings.bg;
            $$("#mo-formats .range-pill", root).forEach(b => b.classList.toggle("active", b.dataset.format === settings.format));
            $$("#mo-ratios .range-pill", root).forEach(b => b.classList.toggle("active", b.dataset.ratio === settings.ratio));
            syncSliderLabels(root);
        }

        let rafPending = false;
        let slotSig = "";
        function render() {
            if (rafPending) return;
            rafPending = true;
            requestAnimationFrame(() => {
                rafPending = false;
                fitSlots();
                const preview = draw(540, true);
                canvasEl.width = preview.width;
                canvasEl.height = preview.height;
                canvasEl.getContext("2d").drawImage(preview, 0, 0);
                const [W, H] = [preview.width, preview.height];
                const sig = [settings.format, settings.ratio, settings.gap, slots.slice(0, cellCount()).map(id => assets.get(id) ? 1 : 0).join("")].join("|");
                if (sig === slotSig) return;
                slotSig = sig;
                slotsEl.innerHTML = cellRects(W, H, Math.min(W, H) / 1080).map((r, i) => {
                    const filled = !!assets.get(slots[i]);
                    return `<div class="mo-slot${filled ? " filled" : ""}" data-i="${i}" draggable="${filled}"
                        style="left:${r.x / W * 100}%;top:${r.y / H * 100}%;width:${r.w / W * 100}%;height:${r.h / H * 100}%">
                        ${filled ? `<div class="mo-slot-actions">
                            <button class="rbx-mini" data-act="replace">replace</button>
                            <button class="rbx-mini" data-act="front">→ front</button>
                            <button class="rbx-mini" data-act="crop">crop</button>
                            <button class="rbx-mini danger" data-act="clear">✕</button>
                        </div>` : '<span class="mo-plus">+</span>'}
                    </div>`;
                }).join("");
            });
        }

        // --- persistence: current work lives in IndexedDB ---
        let persistTimer = null;
        function persist() {
            clearTimeout(persistTimer);
            persistTimer = setTimeout(() => {
                const used = {};
                slots.forEach(id => { const a = assets.get(id); if (a) used[id] = a.blob; });
                idb.set("mosaic", { settings, slots, blobs: used });
            }, 300);
        }

        async function loadState(saved) {
            if (!saved) return;
            const entries = Object.entries(saved.blobs || {});
            const loaded = await Promise.all(entries.map(([id, blob]) => assetFromBlob(blob).then(a => { a.id = id; return a; }).catch(() => null)));
            loaded.forEach(a => { if (a) assets.set(a.id, a); });
            settings = Object.assign({}, DEFAULTS, saved.settings);
            slots = (saved.slots || []).map(id => assets.has(id) ? id : null);
            syncControls();
            render();
        }

        function addAssets(list) {
            pushUndo();
            fitSlots();
            list.forEach(a => {
                assets.set(a.id, a);
                let i = slots.findIndex((id, k) => k < cellCount() && !assets.get(id));
                if (i === -1) { slots.push(a.id); return; }
                slots[i] = a.id;
            });
            render();
            persist();
        }

        async function addFiles(files) {
            try { addAssets(await Promise.all(files.map(assetFromBlob))); } catch (e) { fail(e); }
        }

        async function fillSlot(i, file) {
            const a = await assetFromBlob(file);
            pushUndo();
            assets.set(a.id, a);
            slots[i] = a.id;
            render();
            persist();
        }

        // average saturation x brightness, sampled small
        function vividness(asset) {
            const c = makeCanvas(24, 24);
            const ctx = c.getContext("2d");
            drawCover(ctx, asset.img, 0, 0, 24, 24, asset.w, asset.h);
            const d = ctx.getImageData(0, 0, 24, 24).data;
            let sum = 0;
            for (let i = 0; i < d.length; i += 4) {
                const max = Math.max(d[i], d[i + 1], d[i + 2]), min = Math.min(d[i], d[i + 1], d[i + 2]);
                sum += (max ? (max - min) / max : 0) * (max / 255);
            }
            return sum / (d.length / 4);
        }

        function autoArrange() {
            const n = cellCount();
            const filled = slots.slice(0, n).filter(id => assets.get(id));
            if (filled.length < 2) return;
            pushUndo();
            const ranked = filled.map(id => ({ id, score: vividness(assets.get(id)) })).sort((a, b) => b.score - a.score);
            const [cols, rows] = dims();
            const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => {
                const da = Math.hypot(a % cols - (cols - 1) / 2, Math.floor(a / cols) - (rows - 1) / 2);
                const db = Math.hypot(b % cols - (cols - 1) / 2, Math.floor(b / cols) - (rows - 1) / 2);
                return da - db || a - b;
            });
            const next = Array(n).fill(null);
            ranked.forEach((r, k) => { next[order[k]] = r.id; });
            slots = next.concat(slots.slice(n));
            render();
            persist();
        }

        // --- slot interactions ---
        slotsEl.addEventListener("click", async e => {
            const slot = e.target.closest(".mo-slot");
            if (!slot) return;
            const i = Number(slot.dataset.i);
            const act = e.target.closest("[data-act]");
            try {
                if (!act) {
                    if (!assets.get(slots[i])) {
                        const [file] = await pickFiles(false);
                        if (file) await fillSlot(i, file);
                    }
                    return;
                }
                const asset = assets.get(slots[i]);
                switch (act.dataset.act) {
                    case "replace": {
                        const [file] = await pickFiles(false);
                        if (file) await fillSlot(i, file);
                        break;
                    }
                    case "clear":
                        pushUndo();
                        slots[i] = null;
                        render();
                        persist();
                        break;
                    case "front":
                        if (tools.frontpage) { await tools.frontpage.addVariant(asset); window.robloxTabs.set("frontpage"); }
                        break;
                    case "crop":
                        if (tools.crop) { tools.crop.load(asset, "16:9"); window.robloxTabs.set("crop"); }
                        break;
                }
            } catch (err) { fail(err); }
        });

        let dragFrom = null;
        slotsEl.addEventListener("dragstart", e => {
            const slot = e.target.closest(".mo-slot");
            if (!slot) return;
            dragFrom = Number(slot.dataset.i);
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", String(dragFrom));
        });
        slotsEl.addEventListener("dragover", e => {
            const slot = e.target.closest(".mo-slot");
            if (!slot) return;
            e.preventDefault();
            $$(".mo-slot", slotsEl).forEach(s => s.classList.toggle("drag-over", s === slot));
        });
        slotsEl.addEventListener("dragleave", e => {
            if (!slotsEl.contains(e.relatedTarget)) $$(".mo-slot", slotsEl).forEach(s => s.classList.remove("drag-over"));
        });
        slotsEl.addEventListener("drop", async e => {
            const slot = e.target.closest(".mo-slot");
            $$(".mo-slot", slotsEl).forEach(s => s.classList.remove("drag-over"));
            root.classList.remove("drag-over");
            if (!slot) return;
            e.preventDefault();
            e.stopPropagation();
            const to = Number(slot.dataset.i);
            const files = imageFiles(e.dataTransfer.files);
            if (files.length) {
                try { await fillSlot(to, files[0]); if (files.length > 1) await addFiles(files.slice(1)); } catch (err) { fail(err); }
            } else if (dragFrom != null && dragFrom !== to) {
                pushUndo();
                [slots[dragFrom], slots[to]] = [slots[to], slots[dragFrom]];
                render();
                persist();
            }
            dragFrom = null;
        });
        slotsEl.addEventListener("dragend", () => { dragFrom = null; });

        // --- controls ---
        let pendingUndo = false;
        sliders.forEach(k => {
            const input = $("#mo-" + k, root);
            input.addEventListener("input", () => {
                if (!pendingUndo) { pushUndo(); pendingUndo = true; }
                settings[k] = Number(input.value);
                syncSliderLabels(root);
                render();
            });
            input.addEventListener("change", () => { pendingUndo = false; persist(); });
        });
        $("#mo-bg", root).addEventListener("change", e => { pushUndo(); settings.bg = e.target.value; render(); persist(); });
        $("#mo-formats", root).addEventListener("click", e => {
            const b = e.target.closest("[data-format]");
            if (!b) return;
            pushUndo();
            settings.format = b.dataset.format;
            syncControls();
            render();
            persist();
        });
        $("#mo-ratios", root).addEventListener("click", e => {
            const b = e.target.closest("[data-ratio]");
            if (!b) return;
            pushUndo();
            settings.ratio = b.dataset.ratio;
            syncControls();
            render();
            persist();
        });
        $("#mo-auto", root).addEventListener("click", autoArrange);
        $("#mo-undo", root).addEventListener("click", undo);
        $("#mo-redo", root).addEventListener("click", redo);
        $("#mo-clear", root).addEventListener("click", () => { pushUndo(); slots = []; render(); persist(); });

        const exportName = () => "mosaic_" + settings.format + "_" + settings.ratio.replace(":", "x") + "_" + $("#mo-res", root).value + ".png";
        $("#mo-res", root).value = store.get("rbxMosaicRes", "1080p");
        $("#mo-res", root).addEventListener("change", e => store.set("rbxMosaicRes", e.target.value));
        $("#mo-export", root).addEventListener("click", () => {
            canvasToBlob(draw(RES[$("#mo-res", root).value])).then(b => downloadBlob(b, sessionName(exportName()))).catch(fail);
        });
        $("#mo-copy", root).addEventListener("click", () => {
            canvasToBlob(draw(RES[$("#mo-res", root).value])).then(copyBlob).then(() => toast("copied")).catch(fail);
        });

        // presets: layout + filter settings only
        function renderPresets() {
            const names = Object.keys(presets);
            $("#mo-presets", root).innerHTML = names.length ? names.map(n => `<option>${esc(n)}</option>`).join("") : '<option value="">no presets</option>';
        }
        $("#mo-presetSave", root).addEventListener("click", () => {
            const name = $("#mo-presetName", root).value.trim();
            if (!name) return toast("name the preset first", true);
            presets[name] = Object.assign({}, settings);
            store.set("rbxMosaicPresets", presets);
            $("#mo-presetName", root).value = "";
            renderPresets();
            toast("preset saved");
        });
        $("#mo-presetLoad", root).addEventListener("click", () => {
            const p = presets[$("#mo-presets", root).value];
            if (!p) return;
            pushUndo();
            settings = Object.assign({}, DEFAULTS, p);
            syncControls();
            render();
            persist();
        });

        // boards: whole mosaics with images, in IndexedDB
        async function renderBoards() {
            const boards = (await idb.get("mosaic-boards")) || {};
            const names = Object.keys(boards);
            $("#mo-boards", root).innerHTML = names.length ? names.map(n => `<option>${esc(n)}</option>`).join("") : '<option value="">no boards</option>';
            return boards;
        }
        $("#mo-boardSave", root).addEventListener("click", async () => {
            const name = $("#mo-boardName", root).value.trim();
            if (!name) return toast("name the board first", true);
            const boards = (await idb.get("mosaic-boards")) || {};
            const blobs = {};
            slots.forEach(id => { const a = assets.get(id); if (a) blobs[id] = a.blob; });
            boards[name] = { settings, slots, blobs, saved: Date.now() };
            await idb.set("mosaic-boards", boards);
            $("#mo-boardName", root).value = "";
            await renderBoards();
            $("#mo-boards", root).value = name;
            toast("board saved");
        });
        $("#mo-boardLoad", root).addEventListener("click", async () => {
            const boards = (await idb.get("mosaic-boards")) || {};
            const b = boards[$("#mo-boards", root).value];
            if (!b) return;
            pushUndo();
            await loadState(b);
            persist();
        });
        $("#mo-boardDel", root).addEventListener("click", async () => {
            const boards = (await idb.get("mosaic-boards")) || {};
            delete boards[$("#mo-boards", root).value];
            await idb.set("mosaic-boards", boards);
            renderBoards();
        });

        document.addEventListener("keydown", e => {
            if (!window.robloxTabs || window.robloxTabs.active !== "mosaic") return;
            if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
                e.preventDefault();
                if (e.shiftKey) redo(); else undo();
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
                e.preventDefault();
                redo();
            }
        });

        dropTarget(root, addFiles);
        syncControls();
        renderPresets();
        renderBoards();
        render();
        idb.get("mosaic").then(loadState);

        tools.mosaic = { addFiles, addAsset: a => addAssets([a]) };
    })();

    // =====================================================================
    // Frontpage: preview a thumbnail / icon on a Roblox-style front page
    // =====================================================================
    (() => {
        const root = document.getElementById("rbx-frontpage");
        if (!root) return;

        const FEED_URL = "roblox-feed.json";
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

    // =====================================================================
    // Crop: drag / resize a crop box, export at icon or thumbnail sizes
    // =====================================================================
    (() => {
        const root = document.getElementById("rbx-crop");
        if (!root) return;

        const RATIOS = { "1:1": [1, 1], "16:9": [16, 9], "4:3": [4, 3], free: null, original: null };
        const OUTPUTS = {
            "1:1": [[150, 150], [512, 512], [1024, 1024]],
            "16:9": [[1280, 720], [1920, 1080]],
            "4:3": [[1024, 768]]
        };
        const HANDLE_PX = 12;

        let asset = null;
        let rect = null; // in source pixels
        let prefs = Object.assign({ ratio: "1:1", swap: false, output: "native" }, store.get("rbxCrop", {}));

        root.innerHTML = `
            <div class="rbx-grid-2 crop-layout">
                <div class="rbx-card rbx-controls">
                    <div class="rbx-card-title">Ratio</div>
                    <div class="range-controls" id="cr-ratios">
                        ${Object.keys(RATIOS).map(r => `<button class="range-pill" data-ratio="${r}">${r === "1:1" ? "1:1 square" : r === "16:9" ? "16:9 thumb" : r}</button>`).join("")}
                        <button class="range-pill" id="cr-swap" title="Swap orientation">⇄</button>
                    </div>
                    <div class="rbx-card-title">Output</div>
                    <select id="cr-output" class="rbx-input"></select>
                    <div class="cr-info" id="cr-info"></div>
                    <div class="rbx-row">
                        <button class="rbx-btn primary" id="cr-save">Download PNG</button>
                        <button class="rbx-btn" id="cr-copy">Copy</button>
                    </div>
                    <div class="rbx-row">
                        <button class="rbx-btn" id="cr-icon">→ Update Icon</button>
                        <button class="rbx-btn" id="cr-front">→ Frontpage</button>
                    </div>
                    <div class="rbx-row">
                        <button class="rbx-btn ghost" id="cr-open">Open image</button>
                        <button class="rbx-btn ghost" id="cr-reset">Reset box</button>
                    </div>
                    <div class="rbx-hint">drag to move · corners / edges resize · alt resizes from the centre · shift keeps the ratio in free · arrows nudge (shift = 10px) · enter downloads · esc or double-click resets</div>
                </div>
                <div class="rbx-card">
                    <div class="cr-stage" id="cr-stage">
                        <div class="rbx-drop" id="cr-drop">
                            <i data-lucide="crop"></i>
                            <div>drop, paste (ctrl+v) or click to open an image</div>
                            <div class="rbx-hint">the image never leaves your browser</div>
                        </div>
                        <canvas id="cr-canvas" hidden></canvas>
                    </div>
                </div>
            </div>`;

        const canvasEl = $("#cr-canvas", root);
        const stage = $("#cr-stage", root);
        const drop = $("#cr-drop", root);

        function ratioValue() {
            if (!asset) return null;
            if (prefs.ratio === "original") return asset.w / asset.h;
            const r = RATIOS[prefs.ratio];
            if (!r) return null;
            return prefs.swap ? r[1] / r[0] : r[0] / r[1];
        }

        function outputs() {
            const list = (OUTPUTS[prefs.ratio] || []).map(([w, h]) => prefs.swap ? [h, w] : [w, h]);
            return list.map(([w, h]) => ({ key: w + "x" + h, w, h, label: w === h ? w + " px icon" : w + " × " + h }));
        }

        function outputSize() {
            const o = outputs().find(x => x.key === prefs.output);
            if (o) return [o.w, o.h];
            return [Math.round(rect.w), Math.round(rect.h)];
        }

        function syncControls() {
            $$("#cr-ratios [data-ratio]", root).forEach(b => b.classList.toggle("active", b.dataset.ratio === prefs.ratio));
            const swap = $("#cr-swap", root);
            swap.classList.toggle("active", prefs.swap);
            swap.disabled = !RATIOS[prefs.ratio] || prefs.ratio === "1:1";
            const opts = outputs();
            if (prefs.output !== "native" && !opts.some(o => o.key === prefs.output)) prefs.output = opts.length ? opts[opts.length - 1].key : "native";
            $("#cr-output", root).innerHTML = opts.map(o => `<option value="${o.key}">${o.label}</option>`).join("") + '<option value="native">native</option>';
            $("#cr-output", root).value = prefs.output;
            store.set("rbxCrop", prefs);
        }

        function initialRect() {
            const r = ratioValue();
            if (!r) return { x: 0, y: 0, w: asset.w, h: asset.h };
            let w = asset.w, h = w / r;
            if (h > asset.h) { h = asset.h; w = h * r; }
            return { x: (asset.w - w) / 2, y: (asset.h - h) / 2, w, h };
        }

        // keep the box's centre and area roughly, but snap to the new ratio inside the image
        function applyRatio() {
            if (!asset) return;
            const r = ratioValue();
            if (!rect || !r) { rect = rect && !r ? rect : initialRect(); draw(); return; }
            const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
            const area = rect.w * rect.h;
            let w = Math.sqrt(area * r), h = w / r;
            const s = Math.min(1, asset.w / w, asset.h / h);
            w *= s; h *= s;
            rect = { x: clamp(cx - w / 2, 0, asset.w - w), y: clamp(cy - h / 2, 0, asset.h - h), w, h };
            draw();
        }

        let viewScale = 1; // canvas px per source px
        function draw() {
            if (!asset) return;
            const maxW = stage.clientWidth || 800;
            const maxH = Math.max(320, window.innerHeight * 0.62);
            viewScale = Math.min(maxW / asset.w, maxH / asset.h, 1) * (window.devicePixelRatio || 1);
            const W = Math.round(asset.w * viewScale), H = Math.round(asset.h * viewScale);
            if (canvasEl.width !== W || canvasEl.height !== H) {
                canvasEl.width = W;
                canvasEl.height = H;
            }
            canvasEl.style.width = W / (window.devicePixelRatio || 1) + "px";
            const ctx = canvasEl.getContext("2d");
            ctx.clearRect(0, 0, W, H);
            ctx.drawImage(asset.img, 0, 0, W, H);
            const x = rect.x * viewScale, y = rect.y * viewScale, w = rect.w * viewScale, h = rect.h * viewScale;
            ctx.fillStyle = "rgba(0,0,0,0.6)";
            ctx.beginPath();
            ctx.rect(0, 0, W, H);
            ctx.rect(x, y, w, h);
            ctx.fill("evenodd");
            ctx.strokeStyle = "rgba(255,255,255,0.35)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let i = 1; i < 3; i++) {
                ctx.moveTo(x + w * i / 3, y); ctx.lineTo(x + w * i / 3, y + h);
                ctx.moveTo(x, y + h * i / 3); ctx.lineTo(x + w, y + h * i / 3);
            }
            ctx.stroke();
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, w, h);
            const dpr = window.devicePixelRatio || 1;
            const L = 18 * dpr, T = 4 * dpr;
            ctx.fillStyle = "#fff";
            [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]].forEach(([cx, cy, dx, dy]) => {
                ctx.fillRect(Math.min(cx, cx + dx * L) - dx * T / 2, cy - T / 2, L, T);
                ctx.fillRect(cx - T / 2, Math.min(cy, cy + dy * L) - dy * T / 2, T, L);
            });
            [[x + w / 2, y], [x + w / 2, y + h]].forEach(([cx, cy]) => ctx.fillRect(cx - L / 2, cy - T / 2, L, T));
            [[x, y + h / 2], [x + w, y + h / 2]].forEach(([cx, cy]) => ctx.fillRect(cx - T / 2, cy - L / 2, T, L));

            const [ow, oh] = outputSize();
            const up = ow > Math.round(rect.w) + 1 || oh > Math.round(rect.h) + 1;
            $("#cr-info", root).innerHTML = `crop ${Math.round(rect.w)} × ${Math.round(rect.h)} at ${Math.round(rect.x)}, ${Math.round(rect.y)}<br>output ${ow} × ${oh}`
                + (up ? '<br><span class="warn">upscaled - the source crop is smaller than the output</span>' : "");
        }

        function resizeRect(r0, handle, dx, dy, ratio, fromCenter) {
            const W = asset.w, H = asset.h;
            const hw = handle.includes("w"), he = handle.includes("e"), hn = handle.includes("n"), hs = handle.includes("s");
            const k = fromCenter ? 2 : 1;
            let w = r0.w, h = r0.h;
            if (he) w += dx * k;
            if (hw) w -= dx * k;
            if (hs) h += dy * k;
            if (hn) h -= dy * k;
            w = Math.max(8, w);
            h = Math.max(8, h);
            if (ratio) {
                if ((he || hw) && (hn || hs)) { if (w / ratio > h) h = w / ratio; else w = h * ratio; }
                else if (he || hw) h = w / ratio;
                else w = h * ratio;
            }
            const cx = r0.x + r0.w / 2, cy = r0.y + r0.h / 2;
            const fx = fromCenter ? 0.5 : hw ? 1 : he ? 0 : 0.5;
            const fy = fromCenter ? 0.5 : hn ? 1 : hs ? 0 : 0.5;
            const ax = fromCenter ? cx : hw ? r0.x + r0.w : he ? r0.x : cx;
            const ay = fromCenter ? cy : hn ? r0.y + r0.h : hs ? r0.y : cy;
            const maxW = fx === 0 ? W - ax : fx === 1 ? ax : 2 * Math.min(ax, W - ax);
            const maxH = fy === 0 ? H - ay : fy === 1 ? ay : 2 * Math.min(ay, H - ay);
            if (ratio) {
                const s = Math.min(1, maxW / w, maxH / h);
                w *= s; h *= s;
            } else {
                w = Math.min(w, maxW);
                h = Math.min(h, maxH);
            }
            return { x: ax - w * fx, y: ay - h * fy, w, h };
        }

        function hitTest(px, py) {
            const tol = HANDLE_PX / viewScale * (window.devicePixelRatio || 1);
            const { x, y, w, h } = rect;
            const nearL = Math.abs(px - x) < tol, nearR = Math.abs(px - (x + w)) < tol;
            const nearT = Math.abs(py - y) < tol, nearB = Math.abs(py - (y + h)) < tol;
            const inX = px > x - tol && px < x + w + tol, inY = py > y - tol && py < y + h + tol;
            let hd = "";
            if (inX && inY) {
                if (nearT) hd += "n"; else if (nearB) hd += "s";
                if (nearL) hd += "w"; else if (nearR) hd += "e";
            }
            if (hd) return hd;
            if (px > x && px < x + w && py > y && py < y + h) return "move";
            return null;
        }

        const CURSORS = { n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize", ne: "nesw-resize", sw: "nesw-resize", nw: "nwse-resize", se: "nwse-resize", move: "move" };

        function toSource(e) {
            const b = canvasEl.getBoundingClientRect();
            return [(e.clientX - b.left) / b.width * asset.w, (e.clientY - b.top) / b.height * asset.h];
        }

        let drag = null;
        canvasEl.addEventListener("pointerdown", e => {
            if (!asset) return;
            const [px, py] = toSource(e);
            const mode = hitTest(px, py);
            if (!mode) return;
            canvasEl.setPointerCapture(e.pointerId);
            drag = { mode, px, py, r0: Object.assign({}, rect) };
        });
        canvasEl.addEventListener("pointermove", e => {
            if (!asset) return;
            const [px, py] = toSource(e);
            if (!drag) {
                canvasEl.style.cursor = CURSORS[hitTest(px, py)] || "default";
                return;
            }
            const dx = px - drag.px, dy = py - drag.py;
            if (drag.mode === "move") {
                rect.x = clamp(drag.r0.x + dx, 0, asset.w - rect.w);
                rect.y = clamp(drag.r0.y + dy, 0, asset.h - rect.h);
            } else {
                const ratio = ratioValue() || (e.shiftKey ? drag.r0.w / drag.r0.h : null);
                rect = resizeRect(drag.r0, drag.mode, dx, dy, ratio, e.altKey);
            }
            draw();
        });
        const endDrag = () => { drag = null; };
        canvasEl.addEventListener("pointerup", endDrag);
        canvasEl.addEventListener("pointercancel", endDrag);
        canvasEl.addEventListener("dblclick", () => { rect = initialRect(); draw(); });

        function output() {
            const [ow, oh] = outputSize();
            return resample(asset.img, rect.x, rect.y, rect.w, rect.h, ow, oh);
        }

        const need = () => { if (!asset) { toast("open an image first", true); return false; } return true; };
        const outName = () => {
            const [ow, oh] = outputSize();
            return "crop_" + ow + "x" + oh + ".png";
        };
        function save() {
            if (!need()) return;
            canvasToBlob(output()).then(b => downloadBlob(b, sessionName(outName()))).catch(fail);
        }

        $("#cr-save", root).addEventListener("click", save);
        $("#cr-copy", root).addEventListener("click", () => {
            if (!need()) return;
            canvasToBlob(output()).then(copyBlob).then(() => toast("copied")).catch(fail);
        });
        $("#cr-icon", root).addEventListener("click", async () => {
            if (!need() || !tools.icon) return;
            try {
                await tools.icon.addAsset(await assetFromCanvas(output()));
                window.robloxTabs.set("icon");
            } catch (e) { fail(e); }
        });
        $("#cr-front", root).addEventListener("click", async () => {
            if (!need() || !tools.frontpage) return;
            try {
                const a = await assetFromCanvas(output());
                const r = rect.w / rect.h;
                if (Math.abs(r - 16 / 9) < 0.02) await tools.frontpage.addVariant(a);
                else await tools.frontpage.setIcon(a);
                window.robloxTabs.set("frontpage");
            } catch (e) { fail(e); }
        });
        $("#cr-reset", root).addEventListener("click", () => { if (asset) { rect = initialRect(); draw(); } });
        $("#cr-open", root).addEventListener("click", async () => { const [f] = await pickFiles(false); if (f) addFiles([f]); });
        drop.addEventListener("click", async () => { const [f] = await pickFiles(false); if (f) addFiles([f]); });

        $("#cr-ratios", root).addEventListener("click", e => {
            const b = e.target.closest("button");
            if (!b || b.disabled) return;
            if (b.id === "cr-swap") prefs.swap = !prefs.swap;
            else { prefs.ratio = b.dataset.ratio; if (prefs.ratio === "1:1") prefs.swap = false; }
            syncControls();
            applyRatio();
        });
        $("#cr-output", root).addEventListener("change", e => {
            prefs.output = e.target.value;
            store.set("rbxCrop", prefs);
            draw();
        });

        // keyboard: capture phase so esc resets the box instead of closing the overlay
        window.addEventListener("keydown", e => {
            if (!asset || !window.robloxTabs || window.robloxTabs.active !== "crop") return;
            if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.ctrlKey || e.metaKey) return;
            const step = e.shiftKey ? 10 : 1;
            const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
            if (moves[e.key]) {
                rect.x = clamp(rect.x + moves[e.key][0], 0, asset.w - rect.w);
                rect.y = clamp(rect.y + moves[e.key][1], 0, asset.h - rect.h);
                draw();
            } else if (e.key === "Enter") {
                save();
            } else if (e.key === "Escape") {
                rect = initialRect();
                draw();
            } else {
                return;
            }
            e.preventDefault();
        }, true);

        window.addEventListener("resize", () => { if (asset && window.robloxTabs.active === "crop") draw(); });

        function load(a, ratio) {
            asset = a;
            if (ratio && RATIOS[ratio] !== undefined) { prefs.ratio = ratio; prefs.swap = false; }
            syncControls();
            drop.hidden = true;
            canvasEl.hidden = false;
            rect = initialRect();
            requestAnimationFrame(draw);
        }

        async function addFiles(files) {
            try { load(await assetFromBlob(files[0])); } catch (e) { fail(e); }
        }

        dropTarget(root, addFiles);
        syncControls();

        tools.crop = { addFiles, load, shown: () => { if (asset) requestAnimationFrame(draw); } };
    })();

    // ---- paste routes images to the open tool ----
    window.addEventListener("paste", e => {
        const tab = window.robloxTabs && window.robloxTabs.active;
        if (!tab || !tools[tab] || !tools[tab].addFiles) return;
        const t = e.target;
        if (t && /^(INPUT|TEXTAREA)$/.test(t.tagName) && !(e.clipboardData && e.clipboardData.files.length)) return;
        const files = imageFiles(e.clipboardData && e.clipboardData.files);
        if (!files.length) return;
        e.preventDefault();
        tools[tab].addFiles(files);
    });

    document.addEventListener("roblox:tab", e => {
        const tool = tools[e.detail];
        if (tool && tool.shown) tool.shown();
    });

    icons();
})();
