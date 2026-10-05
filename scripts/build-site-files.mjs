#!/usr/bin/env node
// Rebuilds js/site-files.js, the list of music, backgrounds, profile images and characters the home page
// picks from at random. Run after adding or removing files in assets/: node scripts/build-site-files.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const FOLDERS = { tracks: "music", backgrounds: "backgrounds", images: "images", characters: "characters" };
const MEDIA = /\.(mp3|m4a|ogg|wav|mp4|webm|gif|png|jpe?g|webp)$/i;

const files = {};
for (const [key, dir] of Object.entries(FOLDERS)) {
    files[key] = fs.readdirSync(path.join(ROOT, "assets", dir)).filter(f => MEDIA.test(f)).sort();
}

// ascii-only so the file reads the same whatever charset it's served with
const json = JSON.stringify(files, null, 2).replace(/[\u007f-￿]/g, c => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
fs.writeFileSync(path.join(ROOT, "js", "site-files.js"), "window.siteFiles = " + json + ";\n");
console.log(Object.entries(files).map(([k, v]) => v.length + " " + k).join(", "));
