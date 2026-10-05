(() => {
    "use strict";
    const {
        $, $$, esc, store, idb, assetFromBlob,
        canvasToBlob, imageFiles, pickFiles, makeCanvas, drawCover, roundRectPath,
        previewOf, downloadBlob, copyBlob, sessionName, toast, fail,
        dropTarget, slider, syncSliderLabels, tools
    } = window.Rbx;

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
})();
