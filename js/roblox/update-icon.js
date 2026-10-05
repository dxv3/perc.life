(() => {
    "use strict";
    const {
        $, clamp, esc, uid, store, loadImage,
        assetFromBlob, canvasToBlob, assetFromCanvas, pickFiles, makeCanvas, resample,
        roundRectPath, previewOf, downloadBlob, copyBlob, makeZip, canPickFolder,
        forgetFolder, folderName, saveToFolder, sessionName, slug, toast,
        fail, dropTarget, icons, slider, syncSliderLabels, tools,
        fontsReady
    } = window.Rbx;

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
                toast("saved " + files.length + " file" + (files.length === 1 ? "" : "s") + " to " + folderName());
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
        $("#ic-dest", root).addEventListener("change", e => { if (e.target.value === "folder") forgetFolder(); });

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
})();
