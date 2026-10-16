# perc.life

Personal site with a Roblox section (`/roblox/`): live game stats plus creator tools. Static files on Netlify, no build step; the stats tracker runs as Netlify Functions.

## Layout

```
index.html                  single page: home + Roblox overlay markup
_redirects                  Netlify: /roblox -> index.html
assets/
  music/  backgrounds/  images/  characters/   random picks for the home page
css/
  site.css                  home page
  roblox.css                Roblox overlay, stats, calculators, tools
js/
  site-files.js             generated list of files in assets/ (see scripts/)
  home.js                   entry screen, music player, background, Discord presence
  roblox/
    overlay.js              open/close, tabs, /roblox URL; fires roblox:open / roblox:close / roblox:tab
    stats.js                live stats + charts from /tracking/api/*, game switcher
    calc.js                 DevEx, marketplace tax, black market check
    shared.js               helpers shared by the tools (window.Rbx)
    update-icon.js  mosaic.js  frontpage.js  crop.js   one file per tool
    init.js                 paste routing and tab activation across tools
data/
  roblox-feed.json          Roblox chart games for the Frontpage tool (updated daily)
scripts/
  build-site-files.mjs      rebuild js/site-files.js after changing assets/
  fetch-roblox-feed.mjs     rebuild data/roblox-feed.json (run by the workflow)
netlify/
  lib/games.mjs             the Roblox games being tracked
  lib/store.mjs             snapshot storage (Netlify Blobs, store "tracker")
  functions/poll-games.mjs  scheduled every 5 min: snapshots each game
  functions/tracking-api.mjs  /tracking/api/games and /tracking/api/stats?universeId=
.github/workflows/
  update-roblox-feed.yml    daily feed refresh
```

## Common tasks

- Add a song, background, profile gif or character: drop it in the matching `assets/` folder, then run `node scripts/build-site-files.mjs`.
- Refresh the Frontpage games by hand: Actions -> update roblox feed -> Run workflow, or `node scripts/fetch-roblox-feed.mjs`.
- Run locally: `python3 -m http.server` in the repo root, then open `http://localhost:8000/`.
- Track another Roblox game: add it to `netlify/lib/games.mjs` and push. Polling starts on the next 5-minute tick and it appears in the Stats switcher. To find a universe ID from a place ID, use `https://apis.roblox.com/universes/v1/places/<placeId>/universe`.
- Local runs (`python3 -m http.server`) have no `/tracking/api`; use `netlify dev` to run the functions too.
