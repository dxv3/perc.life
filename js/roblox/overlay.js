// ---- Roblox overlay: in-page stats + tools at /roblox, no navigation so audio never stops ----
// Opening/closing fires roblox:open / roblox:close, switching tabs fires roblox:tab (detail = tab name).
(() => {
    const overlay = document.getElementById("roblox-overlay");
    const link = document.getElementById("roblox-link");
    const closeBtn = document.getElementById("roblox-close");
    if (!overlay || !link || !closeBtn) return;

    // ---- Tabs: stats + tools, current tab kept in the URL hash ----
    const TABS = ["stats", "icon", "mosaic", "calc", "frontpage", "crop"];
    let activeTab = "stats";

    function setTab(tab, replace) {
        if (!TABS.includes(tab)) tab = "stats";
        activeTab = tab;
        overlay.querySelectorAll(".rbx-tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
        overlay.querySelectorAll(".rbx-pane").forEach(p => p.classList.toggle("active", p.dataset.pane === tab));
        if (replace !== false && overlay.classList.contains("show")) {
            history.replaceState({ roblox: true }, "", "/roblox/" + (tab === "stats" ? "" : "#" + tab));
        }
        document.dispatchEvent(new CustomEvent("roblox:tab", { detail: tab }));
    }
    window.robloxTabs = { set: setTab, get active() { return overlay.classList.contains("show") ? activeTab : null; } };

    overlay.querySelectorAll(".rbx-tab").forEach(btn => btn.addEventListener("click", () => setTab(btn.dataset.tab)));

    const bgVideo = document.getElementById("bg-video");
    let videoPausedByOverlay = false;

    function openRoblox(pushState) {
        overlay.classList.add("show");
        document.body.classList.add("overlay-open");
        document.body.classList.remove("bass-flash-bg");
        if (bgVideo && !bgVideo.paused) { bgVideo.pause(); videoPausedByOverlay = true; }
        document.body.style.overflow = "hidden";
        const hashTab = location.hash.slice(1);
        if (pushState !== false) history.pushState({ roblox: true }, "", "/roblox/" + (activeTab === "stats" ? "" : "#" + activeTab));
        else if (TABS.includes(hashTab)) setTab(hashTab, false);
        document.dispatchEvent(new CustomEvent("roblox:open"));
        document.dispatchEvent(new CustomEvent("roblox:tab", { detail: activeTab }));
    }

    function closeRoblox(pushState) {
        overlay.classList.remove("show");
        document.body.classList.remove("overlay-open");
        if (videoPausedByOverlay) { videoPausedByOverlay = false; bgVideo.play().catch(() => {}); }
        document.body.style.overflow = "";
        if (pushState !== false) history.pushState({}, "", "/");
        document.dispatchEvent(new CustomEvent("roblox:close"));
    }

    link.addEventListener("click", (e) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        openRoblox();
    });

    closeBtn.addEventListener("click", () => closeRoblox());

    overlay.addEventListener("click", (e) => {
        if (e.target === overlay) closeRoblox();
    });

    document.addEventListener("keydown", (e) => {
        if (!overlay.classList.contains("show") || e.defaultPrevented) return;
        if (e.key === "Escape") { closeRoblox(); return; }
        const t = e.target;
        const typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
        if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey && /^[1-6]$/.test(e.key)) setTab(TABS[Number(e.key) - 1]);
    });

    window.addEventListener("popstate", () => {
        if (location.pathname.startsWith("/roblox")) {
            openRoblox(false);
        } else {
            closeRoblox(false);
        }
    });

    if (location.pathname.startsWith("/roblox")) openRoblox(false);
})();
