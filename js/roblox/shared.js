// ---- Roblox tools: shared helpers (images, storage, export, UI). Tools read them from window.Rbx ----
(() => {
    "use strict";

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

    const forgetFolder = () => { folderHandle = null; };
    const folderName = () => folderHandle ? folderHandle.name : "";

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

    window.Rbx = {
        $,
        $$,
        clamp,
        esc,
        uid,
        store,
        idb,
        loadImage,
        assetFromBlob,
        canvasToBlob,
        assetFromCanvas,
        imageFiles,
        pickFiles,
        makeCanvas,
        resample,
        drawCover,
        roundRectPath,
        previewOf,
        squareOf,
        downloadBlob,
        copyBlob,
        crc32,
        makeZip,
        canPickFolder,
        freeName,
        forgetFolder,
        folderName,
        saveToFolder,
        sessionName,
        slug,
        toast,
        fail,
        dropTarget,
        icons,
        slider,
        syncSliderLabels,
        tools,
        fontsReady,
    };
})();
