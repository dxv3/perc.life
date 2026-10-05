// ---- Roblox tools: wiring that spans tools (paste routing, tab activation) ----
(() => {
    "use strict";
    const {
        imageFiles, icons, tools
    } = window.Rbx;

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
