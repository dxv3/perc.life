#!/usr/bin/env node
// Builds roblox-feed.json: a snapshot of Roblox's public chart sorts for the Frontpage tool.
// Roblox's JSON APIs don't allow browser CORS, so this runs in a GitHub Action and the file is committed.
// Usage: node scripts/fetch-roblox-feed.mjs [--dry]
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "roblox-feed.json");
const DRY = process.argv.includes("--dry");
const PER_SORT = 24;
const MIN_GAMES = 40;
const SKIP_SORTS = new Set(["more-when-you-subscribe"]);

const sleep = ms => new Promise(r => setTimeout(r, ms));
const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
const int = v => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : 0);
const clean = s => String(s ?? "").replace(/\s+/g, " ").trim();

async function getJson(url) {
    for (let attempt = 1; attempt <= 6; attempt++) {
        await sleep(700);
        try {
            const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20000) });
            if (res.ok) return await res.json();
            if (res.status !== 429 && res.status < 500) throw new Error("HTTP " + res.status + " " + url);
        } catch (err) {
            if (attempt === 6 || /HTTP 4/.test(err.message)) throw err;
        }
        await sleep(1500 * 2 ** attempt);
    }
    throw new Error("gave up on " + url);
}

async function fetchSorts() {
    const session = crypto.randomUUID();
    const sorts = [];
    const seen = new Set();
    let token = "";
    for (let page = 0; page < 10; page++) {
        const data = await getJson("https://apis.roblox.com/explore-api/v1/get-sorts?sessionId=" + session
            + "&device=computer&country=all" + (token ? "&sortsPageToken=" + encodeURIComponent(token) : ""));
        for (const s of data.sorts || []) {
            if (s.contentType !== "Games" || !Array.isArray(s.games) || seen.has(s.sortId) || SKIP_SORTS.has(s.sortId)) continue;
            const games = s.games.filter(g => int(g.universeId) && !g.isSponsored && g.contentMaturity !== "restricted");
            if (!games.length) continue;
            seen.add(s.sortId);
            sorts.push({ id: s.sortId, name: clean(s.sortDisplayName) || s.sortId, games: games.slice(0, PER_SORT + 6) });
        }
        token = data.nextSortsPageToken;
        if (!token) break;
    }
    return sorts;
}

async function batch(ids, size, build, collect) {
    const map = new Map();
    for (const part of chunk(ids, size)) {
        const data = await getJson(build(part.join(",")));
        for (const item of data.data || []) collect(item, map);
    }
    return map;
}

async function main() {
    const sorts = await fetchSorts();
    if (!sorts.length) throw new Error("no game sorts returned");
    const explore = new Map();
    sorts.forEach(s => s.games.forEach(g => { if (!explore.has(int(g.universeId))) explore.set(int(g.universeId), g); }));
    const ids = [...explore.keys()];
    console.log(sorts.length + " sorts, " + ids.length + " games");

    const details = await batch(ids, 50, q => "https://games.roblox.com/v1/games?universeIds=" + q,
        (g, m) => m.set(int(g.id), g));
    const icons = await batch(ids, 100, q => "https://thumbnails.roblox.com/v1/games/icons?universeIds=" + q
        + "&returnPolicy=PlaceHolder&size=256x256&format=Webp&isCircular=false",
        (t, m) => { if (t.state === "Completed" && t.imageUrl) m.set(int(t.targetId), t.imageUrl); });
    const thumbs = await batch(ids, 50, q => "https://thumbnails.roblox.com/v1/games/multiget/thumbnails?universeIds=" + q
        + "&countPerUniverse=1&defaults=true&size=768x432&format=Webp&isCircular=false",
        (u, m) => { const t = (u.thumbnails || [])[0]; if (t && t.state === "Completed" && t.imageUrl) m.set(int(u.universeId), t.imageUrl); });

    const games = {};
    const genres = new Map();
    for (const id of ids) {
        const d = details.get(id), e = explore.get(id);
        if (!d || !icons.has(id) || !thumbs.has(id)) continue;
        const up = int(e.totalUpVotes), down = int(e.totalDownVotes);
        const genreName = clean(d.genre_l1 || e.genreL1) || "Other";
        const genre = genreName.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "other";
        genres.set(genre, genreName);
        games[id] = {
            id,
            placeId: int(d.rootPlaceId),
            name: clean(d.name),
            creator: clean(d.creator && d.creator.name),
            rating: up + down ? Math.round(up * 100 / (up + down)) : 0,
            playing: int(d.playing ?? e.playerCount),
            genre,
            thumb: thumbs.get(id),
            icon: icons.get(id)
        };
    }

    const feed = {
        generatedAt: new Date().toISOString(),
        sorts: sorts.map(s => ({ id: s.id, name: s.name, gameIds: s.games.map(g => int(g.universeId)).filter(id => games[id]).slice(0, PER_SORT) }))
            .filter(s => s.gameIds.length),
        genres: [...genres].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
        games
    };

    const count = Object.keys(games).length;
    if (count < MIN_GAMES) throw new Error("only " + count + " usable games, keeping the old feed");
    console.log(feed.sorts.length + " sorts, " + count + " games, " + feed.genres.length + " genres");
    if (DRY) return;

    // only rewrite when the content changed, so the daily job doesn't commit noise
    try {
        const old = JSON.parse(fs.readFileSync(OUT, "utf8"));
        if (JSON.stringify({ ...old, generatedAt: 0 }) === JSON.stringify({ ...feed, generatedAt: 0 })) {
            console.log("unchanged");
            return;
        }
    } catch (e) {}
    fs.writeFileSync(OUT, JSON.stringify(feed) + "\n");
    console.log("wrote " + OUT);
}

main().catch(err => {
    console.error(err.message || err);
    process.exit(1);
});
