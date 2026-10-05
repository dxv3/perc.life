(() => {
    "use strict";
    const {
        $, $$, clamp, esc, store, assetFromBlob,
        canvasToBlob, assetFromCanvas, pickFiles, resample, downloadBlob, copyBlob,
        sessionName, toast, fail, dropTarget, tools
    } = window.Rbx;

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
})();
